import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_CONFIG, startEngine, startRoundEngine, playerView, applyAction } from 'backend/engine'
import type { RunRecord } from './types.js'

test('cave financial turns explain their restrictions and subsequent decision turns accept every team vote privately', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gtn2-cave-turns-'))
  const teams = [
    { id: 'one', name: 'One', playerIds: ['one-player'], tieOrder: 0, balance: '0', stars: 0 },
    { id: 'two', name: 'Two', playerIds: ['two-player'], tieOrder: 1, balance: '0', stars: 0 },
  ]
  const env = { now: 1000, random: () => 0.5, token: () => 'cave-token' }
  const state = startEngine(teams, DEFAULT_CONFIG, env).state
  state.gameIndex = 2
  state.current = { game: 'cave', phase: 'ready', token: 'ready-token' }
  state.teams.forEach(team => { team.balance = '10000' })
  startRoundEngine(state, env)
  const prompts: any[] = []
  let actions = 0
  const server = createServer((request, response) => {
    void (async () => {
      let body = ''
      for await (const chunk of request) body += chunk
      const input = body ? JSON.parse(body) : null
      response.setHeader('content-type', 'application/json')
      if (request.url === '/v1/chat/completions') {
        const prompt = JSON.parse(input.messages[1].content)
        prompts.push(prompt)
        const action = prompt.turnPhase === 'decision' ? { type: 'cave.decide', decision: 'leave' } : null
        response.end(JSON.stringify({ usage: { total_tokens: 10 }, choices: [{ message: { tool_calls: [{
          id: 'call-' + prompts.length, type: 'function', function: { name: 'submit_turn', arguments: JSON.stringify({
            message: null, privateMessageJson: null, actionJson: action ? JSON.stringify(action) : null, continueDiscussion: false,
          }) },
        }] } }] }))
        return
      }
      const match = request.url?.match(/players\/(team-[12])\/(state|actions)$/)
      if (match) {
        const team = teams[match[1] === 'team-1' ? 0 : 1]!
        if (match[2] === 'actions') { actions++; applyAction(state, team.id, input.token, input.action, env) }
        response.end(JSON.stringify(playerView('cave-session', 'Cave turns', state, team.playerIds[0]!)))
        return
      }
      if (request.url === '/api/simulation/sessions/cave-session') {
        response.end(JSON.stringify({ sessionId: 'cave-session', status: 'playing', revision: 1, logicalTime: env.now, state, events: [] }))
        return
      }
      response.statusCode = 404; response.end(JSON.stringify({ error: 'Unexpected route' }))
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
  const { saveRun, detail } = await import('./store.js')
  const run: RunRecord = {
    id: 'cave-run', name: 'Cave turns', status: 'paused', createdAt: '', updatedAt: '',
    options: { teamCount: 2, seed: 41, mode: 'openai', hostModel: 'mock', playerModel: 'mock', hostReasoningEffort: 'high', playerReasoningEffort: 'high', minDiscussionBeats: 0,
      maxDiscussionBeats: 0, caveDiscussionBeats: 0, maxToolAttempts: 3, hostContextTokens: 128000,
      playerContextTokens: 128000, maxSteps: 20, maxWallTimeMs: 60_000 },
    config: structuredClone(DEFAULT_CONFIG), sessionId: 'cave-session',
    agents: teams.map((team, index) => ({ id: 'team-' + (index + 1), name: team.name, teamId: team.id,
      playerId: team.playerIds[0]!, email: team.name + '@test.invalid', credential: 'test-only' })),
    events: [{ id: 'announced', runId: 'cave-run', sequence: 1, audience: 'public', type: 'host.announcement',
      game: 'cave', round: 1, wallTime: '' }],
    cursor: 1, stepCount: 0, tokensUsed: 0, revision: 0, abortEpoch: 0, elapsedMs: 0, memories: {},
  }
  try {
    await saveRun(run)
    await stepPausedRun(run)
    assert.equal(actions, 0)
    assert.equal(prompts.length, 2)
    for (const prompt of prompts) {
      assert.equal(prompt.turnPhase, 'operations')
      assert.equal(prompt.playerView.roundState.phase, 'cave-decisions')
      assert.match(prompt.rulesCard, /At most 10 decision windows/)
      assert.match(prompt.rulesCard, /every team still inside automatically banks/)
      assert.ok(!prompt.playerView.allowedActions.includes('cave.decide'))
      assert.match(prompt.instruction, /optional financial-action turn/)
      assert.match(prompt.instruction, /actionJson to null/)
      assert.match(prompt.instruction, /separate game-decision turn follows/)
      assert.ok(prompt.actionSchemas.every((schema: any) => ['money.transfer', 'pot.contribute'].includes(schema.properties.type.const)))
    }
    await stepPausedRun(run)
    assert.equal(actions, 2)
    assert.equal(prompts.length, 4)
    for (const prompt of prompts.slice(2)) {
      assert.equal(prompt.turnPhase, 'decision')
      assert.ok(prompt.playerView.allowedActions.includes('cave.decide'))
      assert.match(prompt.instruction, /choose stay or leave/)
      assert.ok(prompt.actionSchemas.some((schema: any) => schema.properties.type.const === 'cave.decide'))
    }
    assert.equal(state.current.phase, 'complete')
    assert.equal(run.events.filter(event => event.type === 'action.accepted').length, 2)
    assert.equal(run.events.filter(event => event.type === 'model.validation-error').length, 0)
    assert.ok(run.events.filter(event => event.type === 'model.request').every(event => ['operations', 'decision'].includes(String(event.data?.turnPhase))))
    assert.ok(!detail(run, 'public').events.some(event => event.type === 'action.accepted'))
    const ownVotes = detail(run, 'team-1').events.filter(event => event.type === 'action.accepted')
    assert.equal(ownVotes.length, 1)
    assert.equal(ownVotes[0]!.audience, 'team-1')
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})
