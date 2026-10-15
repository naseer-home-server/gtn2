import assert from 'node:assert/strict'
import { createServer, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { DEFAULT_CONFIG, playerView, startEngine } from 'backend/engine'
import type { EngineEnv, EngineState, PlayerGameView, Team } from 'backend/engine'
import { providerConfig } from './config.js'
import { hostLine, hostDiscussionSwaps, playerTurn, scriptedTurn, ModelTurnError, ModelRequestError, ModelOutputError } from './provider.js'
import type { RunEvent, RunOptions } from './types.js'
import type { ValidationFailure } from './provider.js'
import { validateOptions } from './config.js'
import { ModelContextError, ModelOutputLimitUnknown } from './context.js'
import { actionSchemas, bombAllocationGuide, validatePlayerAction } from './validation.js'
import { currentRuleCard } from './rules.js'

type ToolArgs = { message: string | null; privateMessageJson: string | null; actionJson: string | null; continueDiscussion: boolean }
type CapturedRequest = { url: string; headers: Record<string, string | string[] | undefined>; body: any }
type MockProvider = { baseUrl: string; requests: CapturedRequest[]; respond: (value: unknown, response?: ServerResponse) => void }

const args = (overrides: Partial<ToolArgs> = {}): ToolArgs => ({
  message: null, privateMessageJson: null,
  actionJson: JSON.stringify({ type: 'bonus.take', amount: '2.00' }), continueDiscussion: false,
  ...overrides,
})
const payload = (toolArgs: ToolArgs, totalTokens = 37, id = 'call-test') => ({ choices: [{ message: { tool_calls: [{ id, type: 'function', function: { name: 'submit_turn', arguments: JSON.stringify(toolArgs) } }] } }], usage: { total_tokens: totalTokens } })
const options = (): RunOptions => ({
  teamCount: 2, seed: 9, mode: 'openai', hostModel: 'mock-host', playerModel: 'mock-player',
  minDiscussionBeats: 0, maxDiscussionBeats: 2, caveDiscussionBeats: 1,
  maxSteps: 40, maxWallTimeMs: 60_000, maxToolAttempts: 1, hostContextTokens: 128000, playerContextTokens: 128000,
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
      const captured = { url: request.url ?? '', headers: request.headers, body: body ? JSON.parse(body) : null }
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
  providerConfig.hostMaxOutputTokens = 200; providerConfig.playerMaxOutputTokens = 200
  providerConfig.hostContextTokens = 0; providerConfig.playerContextTokens = 0
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
    assert.deepEqual(JSON.parse(hostRequest.body.messages[1].content), { ...observation, gameHistory: [] })
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
    const history = prompt.gameHistory
    assert.equal(history.filter((item: any) => item.visibility === 'public').length, 1)
    assert.equal(history[0].text, 'Public offer from Blue.')
    assert.equal(history.find((item: any) => item.type === 'chat.private-message').text, 'message addressed only to Amber')
    assert.deepEqual(history.find((item: any) => item.type === 'reveal.observed').rankings, [{ teamId: 'team-amber', rank: 2 }])
    assert.equal(user.includes('991'), false, 'global private-event sequence must not reveal other private activity')
    for (const secret of ['observer-secret-balances-and-bomb-direction', 'message addressed only to Blue', '987.65', 'hidden-blue-choice']) assert.ok(!user.includes(secret), `prompt leaked ${secret}`)
    assert.match(prompt.instruction, /ordered discussion turn/)
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
      await assert.rejects(playerTurn(view, [], options(), config), actionJson.startsWith('{invalid') ? /valid JSON/ : /validation/i)
    })
  }
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ actionJson: JSON.stringify({ type: 'bomb.allocate', up: 1, down: 1, recipients: {} }) })), response), async () => {
    await assert.rejects(playerTurn(view, [], options(), config), /unavailable/)
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

test('invalid action receives a matching tool validation response and can be corrected privately', async () => {
  const failures: ValidationFailure[] = []
  const usage: number[] = []
  await withMockProvider((_request, response, mock) => {
    const attempt = mock.requests.length
    mock.respond(payload(args({ actionJson: JSON.stringify(attempt === 1
      ? { type: 'bomb.allocate', up: 1, down: 1, recipients: {} }
      : { type: 'bonus.take', amount: '12.50' }) }), attempt * 11, 'call-' + attempt), response)
  }, async mock => {
    const { view, config } = fixture()
    const result = await playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config, true, [], undefined, {
      onUsage: tokens => { usage.push(tokens) }, onValidationError: failure => { failures.push(failure) },
    })
    assert.deepEqual(result.action, { type: 'bonus.take', amount: '12.50' })
    assert.equal(result.tokens, 33)
    assert.deepEqual(usage, [11, 22])
    assert.equal(mock.requests.length, 2)
    const messages = mock.requests[1]!.body.messages
    assert.deepEqual(messages.slice(0, 2), mock.requests[0]!.body.messages)
    assert.equal(messages[2].role, 'assistant')
    assert.equal(messages[2].tool_calls[0].id, 'call-1')
    assert.equal(messages[3].role, 'tool')
    assert.equal(messages[3].tool_call_id, 'call-1')
    const feedback = JSON.parse(messages[3].content)
    assert.equal(feedback.error.code, 'VALIDATION_ERROR')
    assert.equal(feedback.remainingAttempts, 2)
    assert.match(feedback.error.issues.join(' '), /unavailable/)
    assert.equal(failures[0]?.attempt, 1)
    assert.deepEqual(failures[0]?.proposedAction, { type: 'bomb.allocate', up: 1, down: 1, recipients: {} })
    assert.ok(JSON.parse(messages[1].content).actionSchemas.some((schema: any) => schema.properties.type.const === 'bonus.take'))
  })
})

test('malformed JSON and an excessive amount each return feedback before a valid third attempt', async () => {
  await withMockProvider((_request, response, mock) => {
    const attempt = mock.requests.length
    const actionJson = attempt === 1 ? '{invalid json' : JSON.stringify({ type: 'bonus.take', amount: attempt === 2 ? '100.01' : '100.00' })
    mock.respond(payload(args({ actionJson }), 7, 'call-' + attempt), response)
  }, async mock => {
    const { view, config } = fixture()
    const result = await playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config)
    assert.equal(result.tokens, 21)
    assert.equal(mock.requests.length, 3)
    const messages = mock.requests[2]!.body.messages
    assert.match(JSON.parse(mock.requests[1]!.body.messages[3].content).error.issues.join(' '), /valid JSON/)
    assert.match(JSON.parse(messages[3].content).error.issues.join(' '), /choice limit 100.00/)
    assert.equal(messages.length, 4)
    assert.equal(messages[2].tool_calls[0].id, 'call-2')
    assert.ok(!JSON.stringify(messages).includes('call-1'), 'old validation pairs must not accumulate')
  })
})

test('attempt exhaustion reports the last reason and every failed completion counts toward usage', async () => {
  const failures: ValidationFailure[] = []
  const usage: number[] = []
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ actionJson: JSON.stringify({ type: 'bonus.take' }) })), response), async mock => {
    const { view, config } = fixture()
    await assert.rejects(playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config, true, [], undefined, {
      onUsage: tokens => { usage.push(tokens) }, onValidationError: failure => { failures.push(failure) },
    }), (error: unknown) => {
      assert.ok(error instanceof ModelTurnError)
      assert.equal(error.attempts, 3)
      assert.equal(error.tokens, 111)
      assert.match(error.message, /actionJson.amount/)
      return true
    })
    assert.equal(mock.requests.length, 3)
    assert.equal(failures.length, 3)
    assert.equal(usage.reduce((a, b) => a + b, 0), 111)
  })
})

test('discussion and host submissions can repair disallowed game actions without executing them', async () => {
  for (const host of [false, true]) {
    await withMockProvider((_request, response, mock) => mock.respond(payload(args({
      message: 'Public response.',
      actionJson: mock.requests.length === 1 ? JSON.stringify({ type: 'bonus.take', amount: 1 }) : null,
    }), 10), response), async mock => {
      const { view, config } = fixture()
      const result = host
        ? await hostLine({ rulesCard: 'Public rules.' }, { ...options(), maxToolAttempts: 2 })
        : await playerTurn(view, [], { ...options(), maxToolAttempts: 2 }, config, false)
      assert.equal(result.tokens, 20)
      assert.equal(mock.requests.length, 2)
      const feedback = JSON.parse(mock.requests[1]!.body.messages[3].content)
      assert.match(feedback.error.issues.join(' '), host ? /Host/ : /Discussion permits only money.transfer and pot.contribute/)
    })
  }
})

test('cancellation after rejection prevents another model attempt', async () => {
  const controller = new AbortController()
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ actionJson: 'not-json' })), response), async mock => {
    const { view, config } = fixture()
    await assert.rejects(playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config, true, [], controller.signal, {
      onValidationError: () => { controller.abort(new Error('operator paused')) },
    }), /operator paused/)
    assert.equal(mock.requests.length, 1)
  })
})

test('missing tool calls can be corrected, while provider HTTP errors do not consume correction attempts', async () => {
  await withMockProvider((_request, response, mock) => {
    mock.respond(mock.requests.length === 1 ? { choices: [{ message: { content: 'I chose two.' } }], usage: { total_tokens: 5 } } : payload(args()), response)
  }, async mock => {
    const { view, config } = fixture()
    const result = await playerTurn(view, [], { ...options(), maxToolAttempts: 2 }, config)
    assert.equal(result.tokens, 42)
    assert.equal(mock.requests[1]!.body.messages[3].role, 'user')
  })
  await withMockProvider((_request, response) => { response.statusCode = 401; response.end(JSON.stringify({ error: { message: 'Invalid test key' } })) }, async mock => {
    const { view, config } = fixture()
    await assert.rejects(playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config), /Model API 401/)
    assert.equal(mock.requests.length, 1)
  })
})

test('tool-attempt configuration defaults to three and rejects out-of-range limits', () => {
  assert.equal(validateOptions({ mode: 'scripted' }).maxToolAttempts, 3)
  assert.equal(validateOptions({ mode: 'scripted', maxToolAttempts: 1, hostContextTokens: 128000, playerContextTokens: 128000 }).maxToolAttempts, 1)
  for (const maxToolAttempts of [0, 11, 1.5]) assert.throws(() => validateOptions({ mode: 'scripted', maxToolAttempts }), /maxToolAttempts/)
})

test('context window options support automatic discovery and explicit documented limits', () => {
  assert.equal(validateOptions({ mode: 'scripted', hostContextTokens: 0, playerContextTokens: 128000 }).playerContextTokens, 128000)
  for (const value of [-1, 1.5, 10000001]) {
    assert.throws(() => validateOptions({ mode: 'scripted', hostContextTokens: value }), /hostContextTokens/)
    assert.throws(() => validateOptions({ mode: 'scripted', playerContextTokens: value }), /playerContextTokens/)
  }
})

test('visible game constraints reject impossible allocations and preserve exact large money limits', () => {
  const { view } = fixture('bomb')
  assert.throws(() => validatePlayerAction({ type: 'bomb.allocate', up: 14, down: 0, recipients: { 'team-blue': 1 } }, view, true), /between 2 and 13/)
  assert.throws(() => validatePlayerAction({ type: 'bomb.allocate', up: 2, down: 0, recipients: { Blue: 2 } }, view, true), /team IDs/)
  assert.throws(() => validatePlayerAction({ type: 'bomb.allocate', up: 2, down: 0, recipients: { 'team-blue': 1 } }, view, true), /recipients must total/)
  const large = { ...view, allowedActions: ['bonus.take'] as PlayerGameView['allowedActions'], roundState: { ...view.roundState!, choiceLimit: '900719925474099.10' } }
  assert.doesNotThrow(() => validatePlayerAction({ type: 'bonus.take', amount: '900719925474099.10' }, large, true))
  assert.throws(() => validatePlayerAction({ type: 'bonus.take', amount: '900719925474099.11' }, large, true), /choice limit/)
})

test('circle, transfer, and reveal-pot constraints use only the current player funds and visible recipients', () => {
  const { view } = fixture()
  const one = '00000000-0000-4000-8000-000000000001', two = '00000000-0000-4000-8000-000000000002'
  const state: PlayerGameView = { ...view, team: { ...view.team!, stars: 2 }, allowedActions: ['circle.send', 'money.transfer', 'pot.contribute'],
    teams: [{ id: one, name: 'One', stars: 0 }, { id: two, name: 'Two', stars: 0 }], privatePot: { amount: '0.00', target: '20.00' } }
  assert.throws(() => validatePlayerAction({ type: 'circle.send', money: '123.46', stars: 0 }, state, true), /balance/)
  assert.throws(() => validatePlayerAction({ type: 'circle.send', money: 0, stars: 3 }, state, true), /stars/)
  assert.doesNotThrow(() => validatePlayerAction({ type: 'circle.send', money: '123.45', stars: 2 }, state, true))
  assert.throws(() => validatePlayerAction({ type: 'money.transfer', recipientTeamIds: [one, two], amount: '0.01' }, state, true), /per recipient/)
  assert.throws(() => validatePlayerAction({ type: 'money.transfer', recipientTeamIds: [one, two], amount: '1.00',
    allocations: [{ teamId: one, amount: '0.49' }, { teamId: two, amount: '0.50' }] }, state, true), /add up/)
  assert.doesNotThrow(() => validatePlayerAction({ type: 'money.transfer', recipientTeamIds: [one, two], amount: '1.00',
    allocations: [{ teamId: one, amount: '0.50' }, { teamId: two, amount: '0.50' }] }, state, true))
  assert.throws(() => validatePlayerAction({ type: 'pot.contribute', scope: 'self', amount: 0 }, state, true), /at least/)
  // Like the game API, contributions are capped at the remaining pot price.
  assert.doesNotThrow(() => validatePlayerAction({ type: 'pot.contribute', scope: 'self', amount: 200 }, state, true))
})

test('pausing between correction attempts can halt further model requests', async () => {
  let tokens = 0
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ actionJson: 'not-json' }), 10), response), async mock => {
    const { view, config } = fixture()
    await assert.rejects(playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config, true, [], undefined, {
      onUsage: used => { tokens += used },
      beforeAttempt: () => { if (tokens >= 10) throw new Error('Run is no longer running') },
    }), /no longer running/)
    assert.equal(mock.requests.length, 1)
  })
})

test('legacy cumulative token limits are ignored when validating run options', () => {
  const result = validateOptions({ ...options(), mode: 'scripted', maxTokens: 1 } as RunOptions & { maxTokens: number })
  assert.equal('maxTokens' in result, false)
})

test('players retain the full public, own-chat, observation and action history across all games', async () => {
  const transcript: RunEvent[] = []
  for (let i = 0; i < 70; i++) {
    transcript.push({ ...event('room-' + i, 'public', 'Public offer ' + i), sequence: i * 10, game: i < 35 ? 'bonus' : 'high-low', round: 1 })
    transcript.push({ ...event('chat-' + i, 'team-amber', 'Own chat ' + i), type: 'chat.private-message', sequence: i * 10 + 1 })
  }
  transcript.push({ ...event('observation', 'team-amber', '', { view: { token: 'old-token-secret', sessionId: 'old-session', team: { balance: '35.00' } } }), type: 'player.view-observed', sequence: 701 })
  transcript.push({ ...event('action', 'team-amber', '', { action: { type: 'bonus.take', amount: 5 } }), type: 'action.accepted', sequence: 702 })
  transcript.push({ ...event('validation', 'observer', 'Old validation error to exclude'), type: 'model.validation-error', sequence: 703 })
  transcript.push({ ...event('other-private', 'team-blue', 'Blue private secret'), type: 'chat.private-message', sequence: 704 })
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ message: 'Public summary.', actionJson: null })), response), async mock => {
    const { view, config } = fixture()
    await playerTurn(view, transcript, options(), config, false)
    const user = mock.requests[0]!.body.messages[1].content
    const history = JSON.parse(user).gameHistory
    assert.equal(history.filter((item: any) => item.visibility === 'public').length, 70)
    assert.equal(history.filter((item: any) => item.type === 'chat.private-message').length, 70)
    for (const required of ['Public offer 0', 'Public offer 69', 'Own chat 0', 'Own chat 69', '35.00']) assert.ok(user.includes(required))
    for (const secret of ['Old validation error to exclude', 'Blue private secret', 'old-token-secret', 'old-session']) assert.ok(!user.includes(secret))
    assert.deepEqual(history.find((item: any) => item.type === 'action.accepted').action, { type: 'bonus.take', amount: 5 })
    assert.deepEqual(history.map((item: any) => item.order), Array.from({ length: history.length }, (_, index) => index + 1))
    mock.requests.length = 0
    await hostLine({ rulesCard: 'Public rules.' }, options(), undefined, undefined, transcript)
    const hostUser = mock.requests[0]!.body.messages[1].content
    const hostHistory = JSON.parse(hostUser).gameHistory
    assert.equal(hostHistory.length, 70)
    assert.ok(hostUser.includes('Public offer 0') && hostUser.includes('Public offer 69'))
    assert.ok(!hostUser.includes('Own chat') && !hostUser.includes('35.00') && !hostUser.includes('Blue private secret'))
  })
})

test('new turns do not retain validation exchanges from earlier tool calls', async () => {
  await withMockProvider((_request, response, mock) => mock.respond(payload(args({ actionJson: mock.requests.length === 1 ? 'broken-json' : null })), response), async mock => {
    const { view, config } = fixture()
    await playerTurn(view, [], { ...options(), maxToolAttempts: 2 }, config, false)
    await playerTurn(view, [{ ...event('rejection', 'observer', 'validation context secret'), type: 'model.validation-error' }], options(), config, false)
    assert.equal(mock.requests[2]!.body.messages.length, 2)
    assert.ok(!JSON.stringify(mock.requests[2]!.body.messages).includes('broken-json'))
    assert.ok(!JSON.stringify(mock.requests[2]!.body.messages).includes('validation context secret'))
  })
})

test('preflight context guard preserves history and prevents a model request when it will not fit', async () => {
  let code = ''
  await withMockProvider((_request, response, mock) => mock.respond(payload(args()), response), async mock => {
    const { view, config } = fixture()
    await assert.rejects(playerTurn(view, [event('large', 'public', 'x'.repeat(10000))],
      { ...options(), playerContextTokens: 1000 }, config, true, [], undefined, { onContextError: error => { code = error.code } }),
    (error: unknown) => {
      assert.ok(error instanceof ModelContextError)
      assert.equal(error.code, 'MODEL_CONTEXT_LIMIT')
      assert.ok(Number(error.details.estimatedPromptTokens) > 1000)
      return true
    })
    assert.equal(code, 'MODEL_CONTEXT_LIMIT')
    assert.equal(mock.requests.length, 0)
  })
})

test('provider-reported input/output tokens are tracked and actual context pressure pauses without correction retries', async () => {
  const observed: any[] = []
  await withMockProvider((_request, response, mock) => {
    const result = payload(args())
    result.usage = { total_tokens: 127010, prompt_tokens: 127000, completion_tokens: 10 } as any
    mock.respond(result, response)
  }, async mock => {
    const { view, config } = fixture()
    await assert.rejects(playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config, true, [], undefined, {
      onUsage: (_tokens, _attempt, usage) => { observed.push(usage) },
    }), (error: unknown) => {
      assert.ok(error instanceof ModelContextError)
      assert.equal(error.details.measured, true)
      return true
    })
    assert.equal(mock.requests.length, 1)
    assert.equal(observed[0].promptTokens, 127000)
    assert.equal(observed[0].completionTokens, 10)
    assert.equal(observed[0].totalTokens, 127010)
    assert.equal(observed[0].contextWindowTokens, 128000)
  })
})

test('provider context-length errors produce a distinct context pause, not invalid-action retries', async () => {
  await withMockProvider((_request, response) => {
    response.statusCode = 400
    response.end(JSON.stringify({ error: { code: 'context_length_exceeded', message: 'Maximum context length exceeded' } }))
  }, async mock => {
    const { view, config } = fixture()
    await assert.rejects(playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config), (error: unknown) => {
      assert.ok(error instanceof ModelContextError)
      assert.equal(error.code, 'MODEL_CONTEXT_LIMIT')
      assert.equal(error.details.providerCode, 'context_length_exceeded')
      return true
    })
    assert.equal(mock.requests.length, 1)
  })
})

test('automatic context discovery uses provider metadata and reserves its supported output limit', async () => {
  await withMockProvider((request, response, mock) => {
    if (request.url === '/v1/models') mock.respond({ data: [{ id: 'mock-player', context_length: 200000,
      top_provider: { context_length: 128000, max_completion_tokens: 100 } }] }, response)
    else mock.respond(payload(args()), response)
  }, async mock => {
    const { view, config } = fixture()
    const seen: any[] = []
    for (let i = 0; i < 2; i++) await playerTurn(view, [], { ...options(), playerContextTokens: 0 }, config, true, [], undefined, {
      onRequest: request => { seen.push(request) },
    })
    assert.equal(mock.requests.filter(request => request.url === '/v1/models').length, 1)
    assert.equal(seen[0].contextWindowTokens, 128000)
    assert.equal(seen[0].contextSource, 'provider')
    assert.equal(mock.requests.find(request => request.url === '/v1/chat/completions')!.body.max_completion_tokens, 100)
  })
})

test('standard model metadata without context limits requires an explicit window before any completion', async () => {
  await withMockProvider((_request, response, mock) => mock.respond({ data: [{ id: 'mock-player', object: 'model', owned_by: 'example' }] }, response), async mock => {
    const { view, config } = fixture()
    await assert.rejects(playerTurn(view, [], { ...options(), playerContextTokens: 0 }, config), (error: unknown) => {
      assert.ok(error instanceof ModelContextError)
      assert.equal(error.code, 'MODEL_CONTEXT_LIMIT_UNKNOWN')
      return true
    })
    assert.equal(mock.requests.length, 1)
    assert.equal(mock.requests[0]!.url, '/v1/models')
  })
})

test('host and player use their full published output maxima even with manually configured context windows', async () => {
  await withMockProvider((request, response, mock) => {
    if (request.url === '/v1/models') mock.respond({ data: [
      { id: 'mock-host', context_length: 1050000, top_provider: { max_completion_tokens: 64000 } },
      { id: 'mock-player', context_length: 1050000, top_provider: { max_completion_tokens: 128000 } },
    ] }, response)
    else mock.respond(payload(args({ message: request.body.model === 'mock-host' ? 'Host announcement.' : null, actionJson: request.body.model === 'mock-host' ? null : JSON.stringify({ type: 'bonus.take', amount: 1 }) })), response)
  }, async mock => {
    providerConfig.hostMaxOutputTokens = 0; providerConfig.playerMaxOutputTokens = 0
    const { view, config } = fixture()
    const limits = { ...options(), hostContextTokens: 500000, playerContextTokens: 500000 }
    const seen: any[] = []
    await playerTurn(view, [], limits, config, true, [], undefined, { onRequest: request => { seen.push(request) } })
    await hostLine({}, limits, undefined, { onRequest: request => { seen.push(request) } })
    const completions = mock.requests.filter(request => request.url === '/v1/chat/completions')
    assert.equal(completions[0]!.body.max_completion_tokens, 128000)
    assert.equal(completions[1]!.body.max_completion_tokens, 64000)
    assert.equal(mock.requests.filter(request => request.url === '/v1/models').length, 1)
    assert.ok(seen.every(request => request.contextSource === 'configured' && request.contextWindowTokens === 500000 && request.outputSource === 'provider'))
  })
})

test('unpublished output limits pause for documented configuration without guessing or calling completions', async () => {
  await withMockProvider((_request, response, mock) => mock.respond({ data: [{ id: 'mock-player', context_length: 128000 }] }, response), async mock => {
    providerConfig.playerMaxOutputTokens = 0
    const { view, config } = fixture()
    let notifications = 0
    await assert.rejects(playerTurn(view, [], options(), config, true, [], undefined, {
      onOutputError: error => { notifications++; assert.equal(error.code, 'MODEL_OUTPUT_LIMIT_UNKNOWN') },
    }), (error: unknown) => {
      assert.ok(error instanceof ModelOutputLimitUnknown)
      assert.match(error.message, /documented maximum/)
      return true
    })
    assert.equal(notifications, 1)
    assert.equal(mock.requests.length, 1)
    assert.equal(mock.requests[0]!.url, '/v1/models')
  })
})

test('bomb rules, examples and schemas use one combined direction total and a separate recipient total for each team limit', () => {
  const { state, config } = fixture('bomb')
  for (const player of ['alice', 'bob']) {
    const view = playerView('session-id', 'Test', state, player)
    const max = player === 'bob' ? 21 : 13
    const guide = bombAllocationGuide(view)!
    assert.equal(guide.maxTotalPerPile, max)
    assert.equal(guide.minTotalPerPile, 2)
    assert.equal(guide.totalsMustMatch, false)
    assert.doesNotThrow(() => validatePlayerAction(guide.example, view, true))
    const rules = currentRuleCard(view, config)
    assert.match(rules, /exactly TWO piles/)
    assert.match(rules, /Either up or down may be zero/)
    assert.match(rules, new RegExp(`Your own limit is 2–${max}`))
    assert.ok(!rules.includes('each up/down pile'))
    const schema = actionSchemas(view, true).find(item => {
      const type = item.properties?.type
      return typeof type === 'object' && type !== null && type.const === 'bomb.allocate'
    })!
    const up = schema.properties?.up, down = schema.properties?.down
    assert.ok(typeof up === 'object' && up !== null)
    assert.ok(typeof down === 'object' && down !== null)
    assert.equal(up.maximum, max)
    assert.equal(down.maximum, max)
    assert.match(schema.description!, /up \+ down/)
    assert.doesNotThrow(() => validatePlayerAction({ type: 'bomb.allocate', up: max, down: 0, recipients: { 'team-blue': 2 } }, view, true))
    assert.doesNotThrow(() => validatePlayerAction({ type: 'bomb.allocate', up: 0, down: max, recipients: { 'team-blue': max } }, view, true))
  }
})

test('bomb validation returns both actual over-budget pile totals and a corrected allocation succeeds', async () => {
  await withMockProvider((_request, response, mock) => {
    const bad = mock.requests.length === 1
    mock.respond(payload(args({ actionJson: JSON.stringify({ type: 'bomb.allocate', up: 13, down: bad ? 13 : 0,
      recipients: bad ? { 'team-amber': 13, 'team-blue': 13 } : { 'team-blue': 2 } }) })), response)
  }, async mock => {
    const { view, config } = fixture('bomb')
    const result = await playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config)
    assert.deepEqual(result.action, { type: 'bomb.allocate', up: 13, down: 0, recipients: { 'team-blue': 2 } })
    const prompt = JSON.parse(mock.requests[0]!.body.messages[1].content)
    assert.equal(prompt.bombAllocationGuide.maxTotalPerPile, 13)
    const feedback = JSON.parse(mock.requests[1]!.body.messages[3].content)
    assert.equal(feedback.error.issues.length, 2)
    assert.match(feedback.error.issues[0], /13 \+ 13 = 26/)
    assert.match(feedback.error.issues[1], /submitted 26/)
    assert.equal(mock.requests.length, 2)
  })
})

test('exhausted output is a distinct pause rather than repeated invalid-tool attempts, with usage retained', async () => {
  for (const finishReason of ['length', undefined]) {
    await withMockProvider((_request, response, mock) => mock.respond({ choices: [{ finish_reason: finishReason, message: { content: '' } }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300, completion_tokens_details: { reasoning_tokens: 190 } } }, response), async mock => {
      const { view, config } = fixture('bomb')
      let usage = 0, failures = 0
      await assert.rejects(playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config, true, [], undefined, {
        onUsage: (tokens, _attempt, details) => { usage += tokens; assert.equal(details.reasoningTokens, 190) },
        onOutputError: error => { failures++; assert.equal(error.details.reservedOutputTokens, 200) },
        onValidationError: () => { assert.fail('Output exhaustion is not invalid action JSON') },
      }), (error: unknown) => {
        assert.ok(error instanceof ModelOutputError)
        assert.equal(error.code, 'MODEL_OUTPUT_LIMIT')
        assert.match(error.message, /resolved model maximum/)
        return true
      })
      assert.equal(usage, 300)
      assert.equal(failures, 1)
      assert.equal(mock.requests.length, 1)
    })
  }
})

test('dropped model connections preserve safe network diagnostics without validation retries', async () => {
  await withMockProvider((_request, response) => response.destroy(), async mock => {
    const { view, config } = fixture()
    const failures: ModelRequestError[] = []
    await assert.rejects(playerTurn(view, [], { ...options(), maxToolAttempts: 3 }, config, true, [], undefined, {
      onRequestError: error => { failures.push(error) },
      onValidationError: () => { assert.fail('Transport errors must not consume validation attempts') },
    }), (error: unknown) => {
      assert.ok(error instanceof ModelRequestError)
      assert.equal(error.code, 'MODEL_REQUEST_FAILED')
      assert.equal(error.details.phase, 'connect-or-headers')
      assert.ok((error.details.networkCodes as string[]).includes('UND_ERR_SOCKET'))
      assert.match(error.message, /UND_ERR_SOCKET/)
      assert.ok(!JSON.stringify(error.details).includes('test-only-provider-key'))
      return true
    })
    assert.equal(mock.requests.length, 1)
    assert.equal(failures.length, 1)
  })
})

test('operator cancellation is not reported as a model transport failure', async () => {
  const controller = new AbortController()
  await withMockProvider(() => { controller.abort(new Error('Operator paused')) }, async () => {
    const { view, config } = fixture()
    await assert.rejects(playerTurn(view, [], options(), config, true, [], controller.signal, {
      onRequestError: () => { assert.fail('Operator cancellation is not a network failure') },
    }), /Operator paused/)
  })
})


test('action turns reject public and private chat instead of creating unscheduled discussions', async () => {
  const { view, config } = fixture()
  for (const phase of ['operations', 'decision'] as const) {
    for (const field of ['message', 'privateMessageJson'] as const) {
      await withMockProvider((_request, response, mock) => {
        const chat = field === 'message' ? 'One more discussion.' : JSON.stringify({ teamId: 'team-blue', text: 'Unscheduled private proposal.' })
        mock.respond(payload(args({ actionJson: null, ...(mock.requests.length === 1 ? { [field]: chat } : {}) })), response)
      }, async mock => {
        const rejected: ValidationFailure[] = []
        const result = await playerTurn(view, [], { ...options(), maxToolAttempts: 2 }, config, true, [], undefined,
          { turnPhase: phase, onValidationError: failure => { rejected.push(failure) } })
        assert.equal(mock.requests.length, 2)
        assert.equal(result.message, undefined)
        assert.equal(result.privateMessage, undefined)
        assert.match(rejected[0]!.issues.join(' '), /Messaging is allowed only during scheduled discussion turns/)
        for (const request of mock.requests) {
          assert.equal(request.body.tools[0].function.parameters.properties.message.type, 'null')
          assert.equal(request.body.tools[0].function.parameters.properties.privateMessageJson.type, 'null')
        }
      })
    }
  }
})


test('every discussion phase permits chat plus financial actions and hides game choices', async () => {
  const { view, config } = fixture()
  view.team!.id = '00000000-0000-4000-8000-000000000001'
  view.teams[0]!.id = view.team!.id
  view.teams[1]!.id = '00000000-0000-4000-8000-000000000002'
  for (const turnPhase of ['discussion', 'pre-round', 'post-round', 'cave-discussion'] as const) {
    for (const action of [
      { type: 'money.transfer', recipientTeamIds: [view.teams[1]!.id], amount: '5.00' },
      { type: 'pot.contribute', scope: 'self', amount: '1.00' },
      { type: 'pot.contribute', scope: 'public', amount: '1.00' },
    ]) {
      await withMockProvider((_request, response, mock) => mock.respond(payload(args({ message: 'Settling our agreement.', actionJson: JSON.stringify(action) })), response), async mock => {
        const result = await playerTurn(view, [], options(), config, false, [], undefined, { turnPhase })
        assert.equal(result.message, 'Settling our agreement.')
        assert.equal(result.action?.type, action.type)
        const prompt = JSON.parse(mock.requests[0]!.body.messages[1].content)
        assert.deepEqual(new Set(prompt.playerView.allowedActions), new Set(['money.transfer', 'pot.contribute']))
        assert.deepEqual(new Set(prompt.actionSchemas.map((schema: any) => schema.properties.type.const)), new Set(['money.transfer', 'pot.contribute']))
        assert.ok(!prompt.instruction.includes('actionJson must be null'))
        assert.ok(Array.isArray(mock.requests[0]!.body.tools[0].function.parameters.properties.message.type))
      })
    }
  }
})


const orderPayload = (value: unknown, name = 'submit_discussion_swaps') => ({
  choices: [{ message: { content: 'This assistant text must never become a public host message.', tool_calls: [{
    id: 'order-call', type: 'function', function: { name, arguments: JSON.stringify(value) },
  }] } }], usage: { total_tokens: 37 },
})

test('the scheduling host receives numbered teams and public history and can output only swaps', async () => {
  const teams = [{ id: 'a', name: 'Amber' }, { id: 'b', name: 'Blue' }, { id: 'c', name: 'Coral' }]
  const swaps = [{ firstPosition: 1, secondPosition: 3 }]
  await withMockProvider((_request, response, mock) => mock.respond(orderPayload({ swaps }), response), async mock => {
    const transcript = [
      event('public-dependency', 'public', 'We are waiting for Coral to clarify its own proposal.', { speakerName: 'Blue' }),
      event('observer-secret', 'observer', 'hidden-balances-98765-and-cave-attendance'),
      { ...event('private-secret', 'a', 'private-deal-and-transfer-receipt'), type: 'chat.private-message' },
    ]
    const result = await hostDiscussionSwaps(teams, { game: 'bonus', round: 2, discussionStage: 'pre-round' }, options(), undefined, undefined, transcript)
    assert.deepEqual(result, { swaps, tokens: 37 })
    const request = mock.requests[0]!.body
    assert.equal(request.model, 'mock-host')
    assert.deepEqual(request.tool_choice, { type: 'function', function: { name: 'submit_discussion_swaps' } })
    assert.equal(request.tools[0].function.strict, true)
    assert.equal(request.tools[0].function.parameters.additionalProperties, false)
    assert.deepEqual(request.tools[0].function.parameters.required, ['swaps'])
    assert.deepEqual(Object.keys(request.tools[0].function.parameters.properties), ['swaps'])
    assert.equal(request.tools[0].function.parameters.properties.swaps.maxItems, 2)
    assert.equal(request.tools[0].function.parameters.properties.swaps.items.properties.secondPosition.maximum, 3)
    const user = request.messages[1].content
    const prompt = JSON.parse(user)
    assert.deepEqual(prompt.initialOrder, teams.map((team, index) => ({ position: index + 1, teamId: team.id, name: team.name })))
    assert.equal(prompt.gameHistory.length, 1)
    assert.ok(user.includes('waiting for Coral'))
    assert.ok(!user.includes('hidden-balances') && !user.includes('private-deal'))
    assert.equal('playerView' in prompt, false)
    assert.equal('message' in result, false)
    assert.equal('action' in result, false)
  })
})

test('scheduling corrections use their own tool pairing and keep the original roster unchanged', async () => {
  await withMockProvider((_request, response, mock) => mock.respond(orderPayload({
    swaps: mock.requests.length === 1 ? [{ firstPosition: 1, secondPosition: 99 }] : [],
  }), response), async mock => {
    const failures: ValidationFailure[] = []
    const teams = [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }]
    const result = await hostDiscussionSwaps(teams, {}, { ...options(), maxToolAttempts: 2 }, undefined,
      { onValidationError: failure => { failures.push(failure) } })
    assert.deepEqual(result.swaps, [])
    assert.equal(result.tokens, 74)
    assert.equal(failures.length, 1)
    assert.deepEqual(failures[0]!.proposedAction, [{ firstPosition: 1, secondPosition: 99 }])
    assert.deepEqual(mock.requests[1]!.body.messages.slice(0, 2), mock.requests[0]!.body.messages)
    assert.equal(mock.requests[1]!.body.messages[2].tool_calls[0].function.name, 'submit_discussion_swaps')
    assert.equal(mock.requests[1]!.body.messages[3].tool_call_id, 'order-call')
    assert.match(JSON.parse(mock.requests[1]!.body.messages[3].content).instruction, /submit_discussion_swaps/)
  })
})

test('scheduling rejects attempts to replace the roster or submit player advice and actions', async () => {
  for (const value of [
    { swaps: [], schedulerOrder: ['ghost-team'] },
    { swaps: [], message: 'Team One should transfer 20.' },
    { swaps: [], actionJson: '{"type":"bonus.take","amount":100}' },
    { swaps: [{ firstPosition: 1, secondPosition: 1 }] },
  ]) await withMockProvider((_request, response, mock) => mock.respond(orderPayload(value), response), async () => {
    await assert.rejects(hostDiscussionSwaps([{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }], {}, options()), ModelTurnError)
  })
  await withMockProvider((_request, response, mock) => mock.respond(orderPayload({ swaps: [] }, 'submit_turn'), response), async () => {
    await assert.rejects(hostDiscussionSwaps([{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }], {}, options()), /Return exactly one submit_discussion_swaps/)
  })
})
