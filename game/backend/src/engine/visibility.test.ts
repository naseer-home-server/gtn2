import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceEngine, applyAction, startEngine, tickEngine } from './index.js'
import { DEFAULT_CONFIG } from './config.js'
import { playerView } from './views.js'
import type { CaveRound, EngineEnv, EngineState, Team } from './types.js'

const teams = (): Team[] => [
  { id: 'a', name: 'Amber', playerIds: ['alice'], tieOrder: 0, balance: '0', stars: 0 },
  { id: 'b', name: 'Blue', playerIds: ['bob'], tieOrder: 1, balance: '0', stars: 0 },
  { id: 'c', name: 'Coral', playerIds: ['casey'], tieOrder: 2, balance: '0', stars: 0 },
]
let tokenSerial = 0
const env = (now = 1_000): EngineEnv => ({ now, random: () => 0.5, token: () => `token-${++tokenSerial}` })
const start = () => startEngine(teams(), structuredClone(DEFAULT_CONFIG), env()).state
const view = (state: EngineState, playerId: string) => playerView('session', 'Test night', state, playerId)

test('players see their own balance and public stars, with ranks hidden until a paid reveal', () => {
  const state = start()
  state.teams[0].balance = '12345'
  state.teams[1].balance = '98765'
  state.teams[2].balance = '54321'
  state.teams[0].stars = 2
  state.teams[1].stars = 4
  state.history.push({ game: 'bonus', round: 1, payouts: { a: '100', b: '2000', c: '3000' }, details: { choices: { a: '10', b: '20', c: '30' } } })

  const alice = view(state, 'alice')
  assert.deepEqual(alice.team, { id: 'a', name: 'Amber', balance: '123.45', stars: 2 })
  assert.deepEqual(alice.earnings, [{ game: 'bonus', round: 1, amount: '1.00' }])
  assert.deepEqual(alice.teams.map((team) => team.stars), [2, 4, 0])
  assert.ok(alice.teams.every((team) => !('balance' in team) && !('rank' in team)))
  assert.equal(alice.reveal, null)
  assert.ok(!('rankings' in alice))
  const serialized = JSON.stringify(alice)
  assert.ok(!serialized.includes('987.65'))
  assert.ok(!serialized.includes('543.21'))
  assert.ok(!serialized.includes('20.00'))
  assert.ok(!serialized.includes('30.00'))
})

test('cave projection exposes own unbanked money but no remaining-team count or other decisions', () => {
  const state = start()
  state.gameIndex = 2
  state.current = {
    game: 'cave', token: 'cave-token', phase: 'cave', tick: 4, stage: 'decisions', nextTickAt: 20_000,
    inside: ['a', 'b'], unbanked: '123456', decisions: { b: 'stay' }, banked: { a: '0', b: '0', c: '0' }, collapsed: false,
  }
  const alice = view(state, 'alice')
  assert.equal(alice.roundState?.unbanked, '1234.56')
  assert.equal(alice.roundState?.hasLeft, false)
  assert.equal(alice.roundState?.submitted, false)
  assert.deepEqual(alice.allowedActions, ['cave.decide'])
  for (const hidden of ['inside', 'decisions', 'remainingTeams', 'teamsInside', 'b']) {
    assert.ok(!(hidden in (alice.roundState ?? {})), `projection leaked ${hidden}`)
  }
  assert.ok(!JSON.stringify(alice.roundState).includes('stay'))
  assert.equal(view(state, 'casey').roundState?.unbanked, '0.00')
  assert.equal(view(state, 'casey').roundState?.hasLeft, true)
})

test('circle projection shows only the own sender and receipts, never the outgoing recipient or circle map', () => {
  const state = start()
  state.gameIndex = 3
  state.current = {
    game: 'circle', token: 'circle-token', phase: 'return', next: { a: 'b', b: 'c', c: 'a' }, sender: { a: 'c', b: 'a', c: 'b' },
    transfers: { a: { money: '1000', stars: 1 }, b: { money: '0', stars: 0 }, c: { money: '0', stars: 0 } },
    returns: {}, received: { a: { money: '3000', stars: 3 } }, returned: {},
  }
  const alice = view(state, 'alice')
  assert.deepEqual(alice.roundState?.sender, { id: 'c', name: 'Coral', stars: 0 })
  assert.deepEqual(alice.roundState?.received, { money: '30.00', stars: 3 })
  assert.ok(!('next' in (alice.roundState ?? {})))
  assert.ok(!('recipient' in (alice.roundState ?? {})))
  assert.ok(!JSON.stringify(alice.roundState).includes('transfers'))
})

test('bomb projection reveals recipient to everyone and direction only to its recipient', () => {
  const state = start()
  state.gameIndex = 4
  state.advantagedTeamId = 'a'
  state.current = { game: 'bomb', token: 'bomb-token', phase: 'complete', choices: { a: { up: 5, down: 5, recipients: { b: 10 } } }, recipient: 'b', direction: 'down' }
  const alice = view(state, 'alice')
  const bob = view(state, 'bob')
  assert.deepEqual(alice.roundState?.bombRecipient, { id: 'b', name: 'Blue', stars: 0 })
  assert.equal(alice.roundState?.bombDirection, undefined)
  assert.deepEqual(bob.roundState?.bombRecipient, { id: 'b', name: 'Blue', stars: 0 })
  assert.equal(bob.roundState?.bombDirection, 'down')
  assert.equal(alice.roundState?.maxChits, DEFAULT_CONFIG.bomb.advantageChits)
  assert.equal(bob.roundState?.maxChits, DEFAULT_CONFIG.bomb.maxChits)
  assert.ok(!JSON.stringify(alice.roundState).includes('recipients'))
})

test('star advantage remains undisclosed during circle and is exposed when the finale starts', () => {
  const state = start()
  state.teams[1].stars = 3
  state.teams[2].stars = 3
  state.gameIndex = 3
  state.round = 3
  state.current = { game: 'circle', token: 'circle-last', phase: 'complete', next: { a: 'b', b: 'c', c: 'a' }, sender: { a: 'c', b: 'a', c: 'b' }, transfers: {}, returns: {}, received: {}, returned: {} }
  const beforeFinale = view(state, 'alice')
  assert.equal(beforeFinale.roundState?.maxChits, undefined)
  assert.equal(beforeFinale.finaleAdvantage, undefined)
  assert.ok(!('finaleAdvantage' in beforeFinale))
  const events = advanceEngine(state, env())
  assert.equal(state.gameIndex, 4)
  assert.equal(state.advantagedTeamId, 'b') // equal stars break by first arrival
  assert.ok(events.some((event) => event.type === 'bomb.advantage_revealed' && event.data.teamId === 'b'))
  const atFinale = view(state, 'alice')
  assert.deepEqual(atFinale.finaleAdvantage, { teamId: 'b', maxChitsPerPile: DEFAULT_CONFIG.bomb.advantageChits, standardMaxChits: DEFAULT_CONFIG.bomb.maxChits })
  assert.equal(view(state, 'bob').roundState?.maxChits, DEFAULT_CONFIG.bomb.advantageChits)
})

test('rank reveal is a snapshot, each team acknowledges once, then ranks hide and cave timer resumes with a new token', () => {
  const state = start()
  state.gameIndex = 2
  state.teams[0].balance = '1000'
  state.teams[1].balance = '1000'
  state.teams[2].balance = '1000'
  state.current = {
    game: 'cave', token: 'cave-before-reveal', phase: 'cave', tick: 2, stage: 'waiting', nextTickAt: 50_000,
    inside: ['a', 'b', 'c'], unbanked: '4000', decisions: {}, banked: { a: '0', b: '0', c: '0' }, collapsed: false,
  }
  state.pot.target = '1000'
  state.privatePots = Object.fromEntries(state.teams.map((team) => [team.id, { amount: '0', target: '200' }]))
  const events = applyAction(state, 'a', state.current.token, { type: 'pot.contribute', amount: 10 }, env(5_000))
  assert.ok(events.some((event) => event.type === 'rankings.revealed'))
  assert.deepEqual(view(state, 'alice').reveal?.rankings.map((rank) => [rank.teamId, rank.rank]), [['b', 1], ['c', 2], ['a', 3]])
  assert.deepEqual(view(state, 'bob').reveal?.rankings, view(state, 'alice').reveal?.rankings)
  assert.deepEqual(tickEngine(state, env(60_000)), [])
  assert.equal((state.current as CaveRound).nextTickAt, 50_000)
  const ackToken = state.current.token
  applyAction(state, 'a', ackToken, { type: 'reveal.acknowledge' }, env(61_000))
  assert.equal(view(state, 'alice').reveal, null)
  assert.equal(view(state, 'bob').reveal?.rankings.length, 3)
  assert.throws(() => applyAction(state, 'a', ackToken, { type: 'reveal.acknowledge' }, env(61_500)), /already acknowledged/)
  applyAction(state, 'b', ackToken, { type: 'reveal.acknowledge' }, env(62_000))
  applyAction(state, 'c', ackToken, { type: 'reveal.acknowledge' }, env(63_000))
  assert.equal(state.reveal, null)
  assert.equal(view(state, 'bob').reveal, null)
  assert.notEqual(state.current.token, ackToken)
  assert.equal((state.current as CaveRound).nextTickAt, 73_000)
  assert.throws(() => applyAction(state, 'a', ackToken, { type: 'cave.decide', decision: 'stay' }, env(70_000)), /earlier round or tick/)
  assert.deepEqual(tickEngine(state, env(72_999)), [])
  assert.ok(tickEngine(state, env(73_000)).some((event) => event.type === 'cave.survived'))
})
