import assert from 'node:assert/strict'
import { createServer, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { DEFAULT_CONFIG, playerView, startEngine } from 'backend/engine'
import type { EngineEnv, EngineState, PlayerGameView, Team } from 'backend/engine'
import { providerConfig } from './config.js'
import { hostLine, playerTurn, scriptedTurn } from './provider.js'
import type { RunEvent, RunOptions } from './types.js'

type ToolArgs = { message: string | null; privateMessageJson: string | null; actionJson: string | null; continueDiscussion: boolean }
type CapturedRequest = { url: string; headers: Record<string, string | string[] | undefined>; body: any }
type MockProvider = { baseUrl: string; requests: CapturedRequest[]; respond: (value: unknown, response?: ServerResponse) => void }

const args = (overrides: Partial<ToolArgs> = {}): ToolArgs => ({
  message: 'A public proposal.', privateMessageJson: null,
  actionJson: JSON.stringify({ type: 'bonus.take', amount: '2.00' }), continueDiscussion: false,
  ...overrides,
})
const payload = (toolArgs: ToolArgs, totalTokens = 37) => ({ choices: [{ message: { tool_calls: [{ function: { name: 'submit_turn', arguments: JSON.stringify(toolArgs) } }] } }], usage: { total_tokens: totalTokens } })
const options = (): RunOptions => ({
  teamCount: 2, seed: 9, mode: 'openai', hostModel: 'mock-host', playerModel: 'mock-player',
  minDiscussionBeats: 0, maxDiscussionBeats: 2, caveDiscussionBeats: 1,
  maxTokens: 500, maxSteps: 40, maxWallTimeMs: 60_000,
})
const event = (id: string, audience: RunEvent['audience'], text: string, data: Record<string, unknown> = {}): RunEvent => ({
  id, runId: 'run', sequence: 1, audience, type: 'chat.message', text, data, wallTime: '2026-10-14T00:00:00.000Z',
})

function fixture(game: 'bonus' | 'bomb' = 'bonus') {
  const teams: Team[] = [
    { id: 'team-amber', name: 'Amber', playerIds: ['alice'], tieOrder: 0, balance: '0', stars: 2 },
    { id: 'team-blue', name: 'Blue', playerIds: ['bob'], tieOrder: 1, balance: '0', stars: 4 },
  ]
  const config = structuredClone(DEFAULT_CONFIG)
  config.bomb.minChits = 2
  config.bomb.maxChits = 13
  config.bomb.advantageChits = 21
  const env: EngineEnv = { now: 10_000, random: () => 0.5, token: () => 'view-token' }
  const state = startEngine(teams, config, env).state
  state.teams[0]!.balance = '12345'
  state.teams[1]!.balance = '98765'
  state.advantagedTeamId = 'team-blue'
  state.current = game === 'bonus'
    ? { game: 'bonus', phase: 'choices', token: 'bonus-token', choices: {} }
    : { game: 'bomb', phase: 'choices', token: 'bomb-token', choices: {}, recipient: null, direction: null }
  if (game === 'bomb') state.gameIndex = 4
  state.history.push({ game: 'bonus', round: 1, payouts: { 'team-amber': '100', 'team-blue': '2000' }, details: { choices: { 'team-amber': 'hidden-amber-choice', 'team-blue': 'hidden-blue-choice' } } })
  const view = playerView('session-id', 'Test game', state, 'alice')
  return { state, config, view }
}

async function withMockProvider<T>(handler: (request: CapturedRequest, response: ServerResponse, mock: MockProvider) => void, run: (mock: MockProvider) => Promise<T>): Promise<T> {
  const requests: CapturedRequest[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const mock: MockProvider = {
        baseUrl: '', requests,
        respond: (value, target = response) => { target.statusCode = 200; target.setHeader('content-type', 'application/json'); target.end(JSON.stringify(value)) },
      }
      const captured = { url: request.url ?? '', headers: request.headers, body: JSON.parse(body) }
      requests.push(captured)
      handler(captured, response, mock)
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const saved = { ...providerConfig }
  providerConfig.baseUrl = `http://127.0.0.1:${address.port}/v1`
  providerConfig.apiKey = 'test-only-provider-key'
  providerConfig.maxOutputTokens = 200
  const mock: MockProvider = {
    baseUrl: providerConfig.baseUrl, requests,
    respond: (value, response) => { response?.statusCode; },
  }
  try { return await run(mock) }
  finally {
    Object.assign(providerConfig, saved)
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('player and host calls use strict single-tool Chat Completions with bounded tokens', async () => {
  await withMockProvider((request, response, mock) => mock.respond(payload(request.body.model === 'mock-host'
    ? args({ message: 'Let’s hear one more proposal.', actionJson: null, privateMessageJson: null, continueDiscussion: true })
    : args()), response), async (mock) => {
    const { view, config } = fixture()
    const result = await playerTurn(view, [], options(), config)
    assert.equal(result.action?.type, 'bonus.take')
    assert.equal(result.tokens, 37)
    const request = mock.requests[0]!
    assert.equal(request.url, '/v1/chat/completions')
    assert.equal(request.headers.authorization, 'Bearer test-only-provider-key')
    assert.equal(request.body.model, 'mock-player')
    assert.equal(request.body.parallel_tool_calls, false)
    assert.deepEqual(request.body.tool_choice, { type: 'function', function: { name: 'submit_turn' } })
    assert.equal(request.body.tools.length, 1)
    assert.equal(request.body.tools[0].function.name, 'submit_turn')
    assert.equal(request.body.tools[0].function.strict, true)
    assert.equal(request.body.tools[0].function.parameters.additionalProperties, false)
    assert.deepEqual(request.body.tools[0].function.parameters.required, ['message', 'privateMessageJson', 'actionJson', 'continueDiscussion'])
    assert.equal(request.body.max_completion_tokens, 200)

    mock.requests.length = 0
    const observation = { rulesCard: 'Public rules only.', game: 'bonus', phase: 'discussion', publicProgress: { completedRounds: 0 } }
    await hostLine(observation, options())
    const hostRequest = mock.requests[0]!
    assert.equal(hostRequest.body.model, 'mock-host')
    assert.equal(hostRequest.body.parallel_tool_calls, false)
    assert.deepEqual(JSON.parse(hostRequest.body.messages[1].content), observation)
    assert.match(hostRequest.body.messages[0].content, /never imply access to private choices/)
    assert.equal(hostRequest.body.max_completion_tokens, 200)
  })
})

test('player prompt receives only its projected view, public room transcript, and recipient-scoped private chat', async () => {
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ actionJson: null })), response), async (mock) => {
    const { view, config } = fixture()
    const transcript = [
      event('public', 'public', 'Public offer from Blue.', { speakerName: 'Blue' }),
      event('observer', 'observer', 'observer-secret-balances-and-bomb-direction'),
      event('blue-private', 'team-blue', 'message addressed only to Blue'),
    ]
    const privateChats = [
      { ...event('to-amber', 'team-amber', 'message addressed only to Amber', { sender: 'Blue' }), type: 'chat.private-message', sequence: 991, wallTime: '2026-10-14T00:00:00.000Z' },
      { ...event('rank-amber', 'team-amber', '', { snapshotId: 'snapshot-1', scope: 'self', rankings: [{ teamId: 'team-amber', rank: 2 }] }), type: 'reveal.observed', wallTime: '2026-10-14T00:00:03.000Z' },
    ]
    await playerTurn(view, transcript, options(), config, false, privateChats)
    const user = mock.requests[0]!.body.messages[1].content as string
    const prompt = JSON.parse(user)
    assert.equal(prompt.playerView.team.balance, '123.45')
    assert.equal(prompt.playerView.teams[1].balance, undefined)
    assert.equal(prompt.playerView.finaleAdvantage, undefined)
    assert.equal(prompt.roomTranscript.length, 1)
    assert.equal(prompt.roomTranscript[0].text, 'Public offer from Blue.')
    assert.deepEqual(prompt.privateChats, [{ memoryOrder: 1, type: 'chat.private-message', text: 'message addressed only to Amber', sender: 'Blue' }])
    assert.deepEqual(prompt.historicalRankSnapshots, [{ snapshotId: 'snapshot-1', scope: 'self', rankings: [{ teamId: 'team-amber', rank: 2 }], observedAt: '2026-10-14T00:00:03.000Z' }])
    assert.equal(user.includes('991'), false, 'global private-event sequence must not reveal other private activity')
    for (const secret of ['observer-secret-balances-and-bomb-direction', 'message addressed only to Blue', '987.65', 'hidden-blue-choice']) assert.ok(!user.includes(secret), `prompt leaked ${secret}`)
    assert.match(prompt.instruction, /discussion-only/)
  })
})

test('player private-message recipients must be another visible team', async () => {
  const { view, config } = fixture()
  const valid = JSON.stringify({ teamId: 'team-blue', text: 'Private offer.' })
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ privateMessageJson: valid, actionJson: null })), response), async () => {
    const result = await playerTurn(view, [], options(), config, false)
    assert.deepEqual(result.privateMessage, { teamId: 'team-blue', text: 'Private offer.' })
  })
  for (const privateMessageJson of [
    JSON.stringify({ teamId: 'team-amber', text: 'Self message.' }),
    JSON.stringify({ teamId: 'not-a-team', text: 'Unknown recipient.' }),
    JSON.stringify({ teamId: 'team-blue', text: 'x'.repeat(2001) }),
  ]) {
    await withMockProvider((_request, response, mock) => mock.respond(payload(args({ privateMessageJson, actionJson: null })), response), async () => {
      await assert.rejects(playerTurn(view, [], options(), config, false), /Malformed private message/)
    })
  }
})

test('player prompt does not reveal the future finale advantage before the bomb', async () => {
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ actionJson: null })), response), async (mock) => {
    const { view, config } = fixture('bonus')
    assert.equal(view.game, 'bonus')
    assert.equal(view.finaleAdvantage, undefined)
    await playerTurn(view, [], options(), config, false)
    const prompt = mock.requests[0]!.body.messages.map((message: { content: string }) => message.content).join('\n')
    assert.ok(!prompt.includes('987.65'))
    assert.ok(!prompt.includes('hidden-blue-choice'))
    const playerMessage = JSON.parse(mock.requests[0]!.body.messages[1].content) as { playerView: Record<string, unknown> }
    assert.equal('finaleAdvantage' in playerMessage.playerView, false)
    assert.equal('advantagedTeamId' in playerMessage.playerView, false)
  })
})

test('malformed or unavailable model actions are rejected', async () => {
  const { view, config } = fixture()
  for (const actionJson of ['{invalid json', JSON.stringify({ type: 'bonus.take' })]) {
    await withMockProvider((_request, response, mock) => mock.respond(payload(args({ actionJson })), response), async () => {
      await assert.rejects(playerTurn(view, [], options(), config), actionJson.startsWith('{invalid') ? SyntaxError : /invalid/i)
    })
  }
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ actionJson: JSON.stringify({ type: 'bomb.allocate', up: 1, down: 1, recipients: {} }) })), response), async () => {
    await assert.rejects(playerTurn(view, [], options(), config), /unavailable action/)
  })
})

test('cancelling a player request aborts the mock provider request', async () => {
  const controller = new AbortController()
  const { view, config } = fixture()
  await withMockProvider((_request, _response, mock) => {
    setTimeout(() => controller.abort(new Error('test cancellation')), 20)
    void mock
  }, async () => {
    await assert.rejects(playerTurn(view, [], options(), config, true, [], controller.signal), /test cancellation|abort/i)
  })
})

test('scripted bomb allocations honor minimum, standard, and advantage limits across edge configurations', () => {
  for (const [minChits, maxChits, advantageChits] of [[1, 1, 1], [2, 13, 21], [7, 20, 60], [31, 99, 101]]) {
    const { state } = fixture('bomb')
    state.config.bomb.minChits = minChits
    state.config.bomb.maxChits = maxChits
    state.config.bomb.advantageChits = advantageChits
    state.advantagedTeamId = 'team-blue'
    for (const team of state.teams) {
      const view: PlayerGameView = playerView('session-id', 'Test game', state, team.playerIds[0]!)
      const action = scriptedTurn(view, 123).action
      assert.deepEqual(action?.type, 'bomb.allocate')
      if (!action || action.type !== 'bomb.allocate') throw new Error('Scripted bomb action was missing')
      const limit = team.id === state.advantagedTeamId ? advantageChits : maxChits
      assert.ok(action.up + action.down >= minChits && action.up + action.down <= limit)
      const recipientTotal = Object.values(action.recipients).reduce((sum, count) => sum + count, 0)
      assert.ok(recipientTotal >= minChits && recipientTotal <= limit)
      assert.ok(Object.keys(action.recipients).every((teamId) => state.teams.some((candidate) => candidate.id === teamId)))
    }
  }
})
