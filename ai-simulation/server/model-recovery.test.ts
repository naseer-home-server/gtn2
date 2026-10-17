import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_CONFIG, startEngine, startRoundEngine, playerView, applyAction } from 'backend/engine'
import type { RunRecord } from './types.js'

test('exhausted corrections pause without dispatching any batch decisions; a later step resumes safely', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gtn2-tool-recovery-'))
  const teams = [
    { id: 'team-one', name: 'One', playerIds: ['one'], tieOrder: 0, balance: '0', stars: 0 },
    { id: 'team-two', name: 'Two', playerIds: ['two'], tieOrder: 1, balance: '0', stars: 0 },
  ]
  const env = { now: 1000, random: () => 0.5, token: () => 'round-token' }
  const state = startEngine(teams, DEFAULT_CONFIG, env).state
  startRoundEngine(state, env)
  let broken = true, disconnected = false, exhaustedOutput = false, actions = 0
  const bombPrompts: any[] = []
  const calls = new Map<string, number>()
  const server = createServer((request, response) => {
    void (async () => {
      let body = ''
      for await (const chunk of request) body += chunk
      const input = body ? JSON.parse(body) : null
      response.setHeader('content-type', 'application/json')
      if (request.url === '/v1/chat/completions') {
        const prompt = JSON.parse(input.messages[1].content)
        const view = prompt.playerView
        if (view.game === 'bomb') bombPrompts.push(prompt)
        const id = view.team.id
        calls.set(id, (calls.get(id) || 0) + 1)
        if (disconnected && id === 'team-one') { response.destroy(); return }
        // A slow valid sibling must settle before the failed batch pauses.
        if (id === 'team-two') await new Promise(resolve => setTimeout(resolve, 80))
        if (exhaustedOutput && prompt.turnPhase === 'decision') {
          response.end(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '' } }],
            usage: { prompt_tokens: 100, completion_tokens: input.max_completion_tokens, total_tokens: 100 + input.max_completion_tokens } }))
          return
        }
        const action = prompt.turnPhase === 'operations' ? null : broken && id === 'team-one' ? { type: 'bonus.take' }
          : { type: 'bonus.take', amount: 1 }
        response.end(JSON.stringify({ usage: { total_tokens: 10 }, choices: [{ message: {
          tool_calls: [{ id: 'call-' + id + '-' + calls.get(id), type: 'function', function: { name: 'submit_turn',
            arguments: JSON.stringify({ message: null, privateMessageJson: null, actionJson: action === null ? null : JSON.stringify(action), continueDiscussion: false }) } }],
        } }] }))
        return
      }
      const match = request.url?.match(/players\/(team-[12])\/(state|actions)$/)
      if (match) {
        const playerId = match[1] === 'team-1' ? 'one' : 'two'
        if (match[2] === 'actions') { actions++; applyAction(state, playerId === 'one' ? 'team-one' : 'team-two', input.token, input.action, env) }
        response.end(JSON.stringify(playerView('session', 'Recovery test', state, playerId)))
        return
      }
      if (request.url === '/api/simulation/sessions/session') {
        response.end(JSON.stringify({ sessionId: 'session', status: 'playing', revision: 1, logicalTime: 1000, state, events: [] }))
        return
      }
      response.statusCode = 404; response.end(JSON.stringify({ error: 'Unexpected test route' }))
    })().catch(error => { response.statusCode = 500; response.end(JSON.stringify({ error: String(error) })) })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  // Set before importing runner/config/store: this test must never touch a real run or model key.
  process.env.SIMULATION_DATA_DIR = dir
  process.env.GAME_API_BASE_URL = 'http://127.0.0.1:' + address.port
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:' + address.port + '/v1'
  process.env.OPENAI_API_KEY = 'test-only'
  process.env.SIMULATION_SERVICE_KEY = 'test-only-service-key-at-least-32-characters'
  process.env.SIM_HOST_CONTEXT_TOKENS = '0'; process.env.SIM_PLAYER_CONTEXT_TOKENS = '0'
  process.env.SIM_HOST_MAX_OUTPUT_TOKENS = '200'; process.env.SIM_PLAYER_MAX_OUTPUT_TOKENS = '200'
  const { resumeRun, stepPausedRun } = await import('./runner.js')
  const { saveRun, detail, loadStore, getRun } = await import('./store.js')
  const initialTokens = 2_606_867
  const run: RunRecord = {
    id: 'test-recovery', name: 'Recovery test', status: 'paused', createdAt: '', updatedAt: '',
    options: { teamCount: 2, seed: 41, mode: 'openai', hostModel: 'mock', playerModel: 'mock', hostReasoningEffort: 'high', playerReasoningEffort: 'high', minDiscussionBeats: 0,
      maxDiscussionBeats: 0, caveDiscussionBeats: 0, maxToolAttempts: 3, hostContextTokens: 128000, playerContextTokens: 128000, maxSteps: 20, maxWallTimeMs: 60_000 },
    config: structuredClone(DEFAULT_CONFIG), sessionId: 'session',
    agents: teams.map((team, index) => ({ id: 'team-' + (index + 1), name: team.name, teamId: team.id, playerId: team.playerIds[0]!, email: team.name + '@test.invalid', credential: 'test-only' })),
    events: [], cursor: 0, stepCount: 0, tokensUsed: initialTokens, revision: 0, abortEpoch: 0, elapsedMs: 0, memories: {},
  }
  // Old paused runs must resume even when usage exceeds their retired token budget.
  Object.assign(run.options, { maxTokens: 1 })
  for (const [type, data] of [['host.announcement', {}], ['operation.batch.completed', { window: 'bonus:1:choices:' }]] as const) {
    run.events.push({ id: type, runId: run.id, sequence: ++run.cursor, audience: 'observer', type, game: 'bonus', round: 1, data, wallTime: '' })
  }
  try {
    await saveRun(run)
    await resumeRun(run)
    const deadline = Date.now() + 5000
    while (run.status === 'running' && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(run.status, 'paused')
    assert.match(run.error || '', /One: Tool call failed validation after 3/)
    assert.equal(actions, 0)
    assert.equal(calls.get('team-one'), 3)
    assert.equal(calls.get('team-two'), 1)
    assert.equal(run.tokensUsed, initialTokens + 40)
    const rejected = run.events.filter(event => event.type === 'model.validation-error')
    assert.equal(rejected.length, 3)
    assert.ok(rejected.every(event => event.audience === 'observer' && event.data?.agentId === 'team-1'))
    assert.deepEqual(rejected[0]?.data?.proposedAction, { type: 'bonus.take' })
    for (const audience of ['public', 'team-1', 'team-2']) {
      const visible = detail(run, audience)
      assert.equal(visible.summary.error, undefined)
      assert.ok(!visible.events.some(event => event.type === 'model.validation-error'))
    }
    broken = false
    await stepPausedRun(run)
    assert.equal(run.error, undefined)
    assert.equal(actions, 2)
    assert.equal(run.tokensUsed, initialTokens + 60)
    assert.equal(run.status, 'paused')
    assert.equal(state.current.phase, 'complete')
    assert.equal(run.modelUsage?.['team-1']?.totalTokens, 40)
    assert.equal(run.modelUsage?.['team-2']?.totalTokens, 20)
    assert.equal(run.modelUsage?.['team-1']?.calls, 4)
    const publicState = run.events.find(event => event.type === 'game.public-state')?.data?.state as any
    assert.ok(publicState.teams.every((team: any) => !('balance' in team) && !('playerIds' in team)))
    assert.equal(publicState.direction, undefined)
    // Context exhaustion is a separate persisted pause, with no request or action dispatched.
    state.current = { game: 'bonus', phase: 'ready', token: 'context-test-token' }
    startRoundEngine(state, env)
    run.options.playerContextTokens = 1
    const callsBeforeContext = [...calls.values()].reduce((sum, value) => sum + value, 0)
    await assert.rejects(stepPausedRun(run), /MODEL_CONTEXT_LIMIT/)
    assert.equal(run.status, 'paused')
    assert.equal(run.errorCode, 'MODEL_CONTEXT_LIMIT')
    assert.equal(run.errorDetails?.contextWindowTokens, 1)
    assert.equal(run.tokensUsed, initialTokens + 60)
    assert.equal(actions, 2)
    assert.equal([...calls.values()].reduce((sum, value) => sum + value, 0), callsBeforeContext)
    for (const audience of ['public', 'team-1', 'team-2']) {
      const visible = detail(run, audience)
      assert.equal(visible.summary.errorCode, undefined)
      assert.equal(visible.summary.errorDetails, undefined)
      assert.equal(visible.summary.modelUsage, undefined)
      assert.ok(!visible.events.some(event => event.type === 'model.context-limit'))
    }
    // Old persisted runs receive the default without losing their history.
    delete (run.options as Partial<typeof run.options>).maxToolAttempts
    await saveRun(run)
    await loadStore()
    assert.equal(getRun(run.id)?.options.maxToolAttempts, 3)
    assert.equal('maxTokens' in getRun(run.id)!.options, false)
    assert.equal(getRun(run.id)?.tokensUsed, initialTokens + 60)
    assert.equal(getRun(run.id)?.errorCode, 'MODEL_CONTEXT_LIMIT')
    assert.equal(getRun(run.id)?.modelUsage?.['team-1']?.totalTokens, 40)
    assert.equal(getRun(run.id)?.events.length, run.events.length)
    // A transport failure also pauses with operator diagnostics and dispatches no batch actions.
    run.options.playerContextTokens = 128000
    disconnected = true
    await assert.rejects(stepPausedRun(run), /Model request.*failed/)
    assert.equal(run.status, 'paused')
    assert.equal(run.errorCode, 'MODEL_REQUEST_FAILED')
    assert.equal(run.errorDetails?.agentId, 'team-1')
    assert.ok(run.events.some(event => event.type === 'model.request-error' && event.audience === 'observer'))
    assert.equal(actions, 2)
    assert.equal(detail(run, 'public').summary.errorDetails, undefined)
    await loadStore()
    assert.equal(getRun(run.id)?.errorCode, 'MODEL_REQUEST_FAILED')
    disconnected = false
    await stepPausedRun(run)
    assert.equal(run.errorCode, undefined)
    assert.equal(run.errorDetails, undefined)
    assert.equal(actions, 4)
    // Ongoing bomb sessions receive an explicit correction to legacy rules, once per round.
    state.gameIndex = 4
    state.current = { game: 'bomb', phase: 'ready', token: 'bomb-ready' }
    startRoundEngine(state, env)
    for (const [type, text] of [['rules.card', 'Allocate chits to each up/down pile.'], ['host.announcement', 'Legacy bomb announcement.']]) {
      run.events.push({ id: 'legacy-' + type, runId: run.id, sequence: ++run.cursor, audience: 'public', type: type!, text,
        game: 'bomb', round: 1, wallTime: '' })
    }
    await stepPausedRun(run)
    assert.equal(run.events.filter(event => event.type === 'rules.correction').length, 1)
    assert.ok(bombPrompts.every(prompt => prompt.rulesCard.includes('There are exactly TWO piles')
      && prompt.rulesCard.includes('one direction pile containing up and down chits together')),
    'the authoritative player rules card supersedes a legacy correction event in model history')
    exhaustedOutput = true
    await assert.rejects(stepPausedRun(run), /Model output limit reached/)
    assert.equal(run.status, 'paused')
    assert.equal(run.errorCode, 'MODEL_OUTPUT_LIMIT')
    assert.equal(actions, 4)
    assert.equal(run.events.filter(event => event.type === 'rules.correction').length, 1)
    assert.ok(run.events.some(event => event.type === 'model.output-limit' && event.audience === 'observer'))
    assert.equal(detail(run, 'public').summary.errorCode, undefined)
    await loadStore()
    assert.equal(getRun(run.id)?.errorCode, 'MODEL_OUTPUT_LIMIT')
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})
