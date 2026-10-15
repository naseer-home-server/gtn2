import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_CONFIG, startEngine, startRoundEngine, advanceEngine, playerView, applyAction } from 'backend/engine'
import type { EngineState, GameId } from 'backend/engine'
import type { RunOptions, RunRecord } from './types.js'

test('discussion cadence respects zero, consensus, shared round boundaries, and hard limits', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gtn2-discussion-cadence-'))
  const teams = [
    { id: 'one', name: 'One', playerIds: ['one-player'], tieOrder: 0, balance: '0', stars: 0 },
    { id: 'two', name: 'Two', playerIds: ['two-player'], tieOrder: 1, balance: '0', stars: 0 },
  ]
  let token = 0
  const env = { now: 1000, random: () => 0.5, token: () => 'token-' + ++token }
  let state: EngineState = startEngine(teams, DEFAULT_CONFIG, env).state
  const prompts: any[] = []
  const reviews: any[] = []
  let keepDiscussing = false
  let contribute = false
  let counter = 0
  const server = createServer((request, response) => {
    void (async () => {
      let body = ''
      for await (const chunk of request) body += chunk
      const input = body ? JSON.parse(body) : null
      response.setHeader('content-type', 'application/json')
      if (request.url === '/v1/chat/completions') {
        const prompt = JSON.parse(input.messages[1].content)
        prompts.push(prompt)
        let action: unknown = null
        let message: string | null = null
        if (prompt.reviewRequired) {
          reviews.push(prompt)
          message = keepDiscussing ? 'A concrete question remains.' : 'The plan is agreed. Discussion is closed.'
        } else if (!prompt.playerView) message = 'The next round rules are ready.'
        else if (['pre-round', 'post-round', 'cave-discussion'].includes(prompt.turnPhase)) {
          message = 'I agree to the proposed plan, including its stated conditions.'
        } else {
          assert.equal(input.tools[0].function.parameters.properties.message.type, 'null')
          assert.equal(input.tools[0].function.parameters.properties.privateMessageJson.type, 'null')
          if (prompt.turnPhase === 'decision') {
            action = prompt.playerView.game === 'cave' ? { type: 'cave.decide', decision: 'leave' }
              : { type: 'bonus.take', amount: '1.00' }
          } else if (contribute && prompt.playerView.roundState.phase === 'ready' && prompt.playerView.allowedActions.includes('pot.contribute')) {
            action = { type: 'pot.contribute', scope: 'self', amount: '1.00' }
          }
        }
        response.end(JSON.stringify({ usage: { total_tokens: 10 }, choices: [{ message: { tool_calls: [{
          id: 'call-' + prompts.length, type: 'function', function: { name: 'submit_turn', arguments: JSON.stringify({
            message, privateMessageJson: null, actionJson: action ? JSON.stringify(action) : null,
            continueDiscussion: prompt.reviewRequired ? keepDiscussing : false,
          }) },
        }] } }] }))
        return
      }
      const match = request.url?.match(/players\/(team-[12])\/(state|actions)$/)
      if (match) {
        const team = teams[match[1] === 'team-1' ? 0 : 1]!
        if (match[2] === 'actions') applyAction(state, team.id, input.token, input.action, env)
        response.end(JSON.stringify(playerView('session', 'Discussion cadence', state, team.playerIds[0]!)))
        return
      }
      if (request.url === '/api/simulation/sessions/session/control') {
        if (input.operation === 'start') startRoundEngine(state, env)
        else if (input.operation === 'prepare') advanceEngine(state, env, true)
        else throw new Error('Unexpected control: ' + input.operation)
      } else if (request.url !== '/api/simulation/sessions/session') {
        response.statusCode = 404; response.end(JSON.stringify({ error: 'Unexpected test route' })); return
      }
      response.end(JSON.stringify({ sessionId: 'session', status: state.status, revision: state.revision, logicalTime: env.now, state, events: [] }))
    })().catch(error => { response.statusCode = 500; response.end(JSON.stringify({ error: String(error) })) })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  process.env.SIMULATION_DATA_DIR = dir
  process.env.GAME_API_BASE_URL = 'http://127.0.0.1:' + address.port
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:' + address.port + '/v1'
  process.env.OPENAI_API_KEY = 'test-only'
  process.env.SIM_HOST_MAX_OUTPUT_TOKENS = '200'; process.env.SIM_PLAYER_MAX_OUTPUT_TOKENS = '200'
  process.env.SIMULATION_SERVICE_KEY = 'test-only-service-key-at-least-32-characters'
  const { stepPausedRun } = await import('./runner.js')
  const { saveRun } = await import('./store.js')
  async function fresh(game: GameId = 'bonus', overrides: Partial<RunOptions> = {}) {
    state = startEngine(teams, DEFAULT_CONFIG, env, game).state
    state.teams.forEach(team => { team.balance = '10000' })
    prompts.length = 0; reviews.length = 0; keepDiscussing = false; contribute = false
    const run: RunRecord = {
      id: 'cadence-' + ++counter, name: 'Discussion cadence', status: 'paused', createdAt: '', updatedAt: '',
      options: { teamCount: 2, seed: 41, mode: 'openai', hostModel: 'mock-host', playerModel: 'mock-player',
        minDiscussionBeats: 1, maxDiscussionBeats: 4, caveDiscussionBeats: 0, maxToolAttempts: 2,
        hostContextTokens: 128000, playerContextTokens: 128000, maxSteps: 100, maxWallTimeMs: 60_000, ...overrides },
      config: structuredClone(DEFAULT_CONFIG), sessionId: 'session',
      agents: teams.map((team, index) => ({ id: 'team-' + (index + 1), name: team.name, teamId: team.id,
        playerId: team.playerIds[0]!, email: team.name + '@test.invalid', credential: 'test-only' })),
      events: [], cursor: 0, stepCount: 0, tokensUsed: 0, revision: 0, abortEpoch: 0, elapsedMs: 0, memories: {},
    }
    await saveRun(run)
    return run
  }
  async function until(run: RunRecord, done: () => boolean) {
    for (let i = 0; i < 45 && !done(); i++) await stepPausedRun(run)
    assert.ok(done(), 'runner did not reach the expected phase')
  }
  const beats = (run: RunRecord) => run.events.filter(event => event.type === 'discussion.beat')
  try {
    await t.test('zero cave sweeps produces no cave discussion notices, calls, or action chatter', async () => {
      const run = await fresh('cave')
      startRoundEngine(state, env)
      await until(run, () => state.current.phase === 'complete')
      assert.equal(beats(run).length, 0)
      assert.ok(!run.events.some(event => ['discussion.opened', 'discussion.closed', 'player.message'].includes(event.type)))
      assert.ok(!prompts.some(prompt => prompt.turnPhase === 'cave-discussion' || prompt.reviewRequired))
      assert.equal(run.events.filter(event => event.type === 'action.accepted').length, 2)
    })
    await t.test('the first round closes after one agreed sweep and finances remain available while ready', async () => {
      const run = await fresh()
      contribute = true
      await until(run, () => state.current.phase === 'choices')
      assert.equal(beats(run).length, 1)
      assert.equal(reviews.length, 1)
      assert.equal(reviews[0].completedSweeps, 1)
      assert.equal(reviews[0].minimumSweeps, 1)
      assert.equal(reviews[0].maximumSweeps, 4)
      assert.equal(reviews[0].currentSweep.length, 2)
      assert.ok(reviews[0].currentSweep.every((reply: any) => reply.message.includes('I agree')))
      assert.deepEqual(new Set(reviews[0].currentSweep.map((reply: any) => reply.speaker)), new Set(['One', 'Two']))
      assert.ok(!JSON.stringify(reviews[0].currentSweep).includes('balance'))
      assert.ok(run.events.some(event => event.type === 'action.accepted' && (event.data?.action as any)?.type === 'pot.contribute'))
      assert.equal(run.events.filter(event => event.type === 'player.message').length, 2)
    })
    await t.test('one shared discussion covers results and upcoming rules between two rounds', async () => {
      const run = await fresh()
      await until(run, () => state.round === 2 && state.current.phase === 'choices')
      assert.equal(beats(run).length, 2, 'one initial discussion plus one discussion between rounds')
      assert.ok(beats(run).every(event => event.data?.discussionStage === 'pre-round'))
      assert.equal(run.events.filter(event => event.type === 'discussion.opened').length, 2)
      const nextDiscussion = prompts.filter(prompt => prompt.turnPhase === 'pre-round' && prompt.playerView.round === 2)
      assert.equal(nextDiscussion.length, 2)
      for (const prompt of nextDiscussion) {
        assert.match(prompt.rulesCard, /Round 2/)
        assert.ok(prompt.gameHistory.some((event: any) => event.type === 'round.feedback' && event.round === 1))
      }
      const firstNextSpeaker = run.events.find(event => event.type === 'player.message' && event.round === 2)!
      assert.equal(run.events.filter(event => event.type === 'round.feedback' && event.round === 1 && event.sequence < firstNextSpeaker.sequence).length, 2)
    })
    await t.test('the minimum is enforced when the host closes early', async () => {
      const run = await fresh('bonus', { minDiscussionBeats: 2 })
      await until(run, () => state.current.phase === 'choices')
      assert.equal(beats(run).length, 2)
    })
    await t.test('host requests cannot exceed the maximum', async () => {
      const run = await fresh('bonus', { maxDiscussionBeats: 2 })
      keepDiscussing = true
      await until(run, () => state.current.phase === 'choices')
      assert.equal(beats(run).length, 2)
      assert.equal(run.events.findLast(event => event.type === 'host.discussion-decision')!.data?.continueDiscussion, false)
    })
    await t.test('a positive cave setting remains an exact per-window count', async () => {
      const run = await fresh('cave', { caveDiscussionBeats: 2 })
      startRoundEngine(state, env)
      await until(run, () => state.current.phase === 'complete')
      assert.equal(beats(run).length, 2)
      assert.ok(beats(run).every(event => event.data?.discussionStage === 'cave-discussion' && event.data.window === 1))
    })
    await t.test('a completed legacy post-round discussion is not repeated before the next round', async () => {
      const run = await fresh()
      startRoundEngine(state, env)
      for (const team of teams) applyAction(state, team.id, state.current.token, { type: 'bonus.take', amount: '1.00' }, env)
      const { appendEvent } = await import('./store.js')
      for (const [type, data] of [
        ['round.complete', {}],
        ['discussion.opened', { discussionStage: 'post-round' }],
        ['discussion.closed', { discussionStage: 'post-round' }],
        ['operation.batch.completed', { window: 'post-settlement:bonus:1' }],
      ] as const) {
        await appendEvent(run, { audience: 'public', type, game: 'bonus', round: 1, data })
      }
      await until(run, () => state.round === 2 && state.current.phase === 'choices')
      assert.equal(beats(run).length, 0)
      assert.ok(!prompts.some(prompt => prompt.turnPhase === 'pre-round'))
    })
    await t.test('finale feedback, one closing discussion, and settlement precede final standings', async () => {
      const run = await fresh('bomb')
      state.round = 3
      startRoundEngine(state, env)
      for (const team of teams) applyAction(state, team.id, state.current.token,
        { type: 'bomb.allocate', up: 1, down: 0, recipients: { one: 1 } }, env)
      await until(run, () => run.status === 'finished')
      assert.equal(beats(run).length, 1)
      assert.equal(beats(run)[0]!.data?.discussionStage, 'post-round')
      const firstSpeaker = run.events.find(event => event.type === 'player.message')!
      assert.equal(run.events.filter(event => event.type === 'round.feedback' && event.sequence < firstSpeaker.sequence).length, 2)
      const settlement = run.events.find(event => event.type === 'operation.batch.completed' && event.data?.window === 'post-settlement:bomb:3')!
      assert.ok(settlement.sequence < run.events.find(event => event.type === 'final.standings')!.sequence)
      assert.ok(!run.events.some(event => event.type === 'discussion.opened' && event.data?.discussionStage === 'pre-round'))
    })
    await t.test('zero normal limits skip notices and discussion before play', async () => {
      const run = await fresh('bonus', { minDiscussionBeats: 0, maxDiscussionBeats: 0 })
      await until(run, () => state.current.phase === 'choices')
      assert.equal(beats(run).length, 0)
      assert.ok(!run.events.some(event => event.type === 'discussion.opened' || event.type === 'discussion.closed'))
    })
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})
