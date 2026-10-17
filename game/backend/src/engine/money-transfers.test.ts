import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyAction, playerView, resetCurrentGame, startEngine, startRoundEngine } from './index.js'
import { DEFAULT_CONFIG, gameActionSchema } from './config.js'
import type { EngineEnv, EngineState, Team } from './types.js'

let sequence = 0
const env = (): EngineEnv => ({ now: 1_000, random: () => 0.5, token: () => `transfer-${++sequence}` })
const makeTeams = (): Team[] => [
  { id: 'a', name: 'Amber', playerIds: ['alice', 'alexa'], leaderPlayerId: 'alice', tieOrder: 0, balance: '0', stars: 1 },
  { id: 'b', name: 'Blue', playerIds: ['bob'], tieOrder: 1, balance: '0', stars: 2 },
  { id: 'c', name: 'Coral', playerIds: ['casey'], tieOrder: 2, balance: '0', stars: 0 },
]
const start = (game: 'bonus' | 'bomb' = 'bonus') => startEngine(makeTeams(), structuredClone(DEFAULT_CONFIG), env(), game).state
const action = (state: EngineState, from = 'a', recipientTeamIds = ['b'], amount: string | number = '1.00') =>
  applyAction(state, from, state.current.token, { type: 'money.transfer', recipientTeamIds, amount }, env())
const snapshot = (state: EngineState) => structuredClone(state)
const setCurrent = (state: EngineState, current: EngineState['current']) => { state.current = current }

test('multi-recipient transfer splits arbitrary-precision cents evenly and assigns remainder by tie order', () => {
  const state = start()
  state.teams[0].balance = '900719925474099312345'
  state.teams[1].balance = '99'
  state.teams[2].balance = '0'
  // Assignment/state order differs from the frozen arrival order for B and C.
  state.teams[1].tieOrder = 2
  state.teams[2].tieOrder = 1
  const token = state.current.token
  const before = snapshot(state)

  // Request order also differs from tie order; Coral receives the one remainder cent.
  const events = action(state, 'a', ['b', 'c'], '1234567890123456789.07')

  assert.equal(state.teams[0].balance, '777263136461753633438')
  assert.equal(state.teams[1].balance, '61728394506172839552')
  assert.equal(state.teams[2].balance, '61728394506172839454')
  assert.equal(BigInt(state.teams[0].balance) + BigInt(state.teams[1].balance) + BigInt(state.teams[2].balance),
    BigInt(before.teams[0].balance) + BigInt(before.teams[1].balance) + BigInt(before.teams[2].balance))
  assert.equal(state.current.token, token)
  assert.equal(state.current.phase, before.current.phase)
  assert.deepEqual(state.history, before.history)
  assert.deepEqual(state.pot, before.pot)
  assert.deepEqual(state.current, before.current)
  assert.deepEqual(state.moneyTransfers?.map(({ fromTeamId, toTeamId, amount: transferAmount }) => ({ fromTeamId, toTeamId, amount: transferAmount })), [
    { fromTeamId: 'a', toTeamId: 'c', amount: '61728394506172839454' },
    { fromTeamId: 'a', toTeamId: 'b', amount: '61728394506172839453' },
  ])
  assert.deepEqual(events.filter((event) => event.type === 'money.transferred').map(({ data }) => ({ toTeamId: data.toTeamId, amount: data.amount })), [
    { toTeamId: 'c', amount: '61728394506172839454' },
    { toTeamId: 'b', amount: '61728394506172839453' },
  ])
  assert.equal(state.moneyTransfers?.length, 2)
  const alice = playerView('s', 'night', state, 'alice')
  assert.deepEqual(alice.teams.map(({ id }) => id), ['a', 'c', 'b'])
  assert.deepEqual(alice.moneyTransfers.map(({ toTeamId, amount: transferAmount }) => ({ toTeamId, amount: transferAmount })), [
    { toTeamId: 'c', amount: '617283945061728394.54' },
    { toTeamId: 'b', amount: '617283945061728394.53' },
  ])
})

test('API transfer schema requires a unique, nonempty UUID recipient array', () => {
  const teamB = '123e4567-e89b-42d3-a456-426614174000'
  const teamC = '123e4567-e89b-42d3-a456-426614174001'
  assert.equal(gameActionSchema.safeParse({ type: 'money.transfer', recipientTeamIds: [teamB], amount: '1.00' }).success, true)
  assert.equal(gameActionSchema.safeParse({ type: 'money.transfer', recipientTeamIds: [teamB, teamC], amount: '2.00' }).success, true)
  assert.equal(gameActionSchema.safeParse({ type: 'money.transfer', recipientTeamIds: [], amount: '1.00' }).success, false)
  assert.equal(gameActionSchema.safeParse({ type: 'money.transfer', recipientTeamIds: [teamB, teamB], amount: '2.00' }).success, false)
  assert.equal(gameActionSchema.safeParse({ type: 'money.transfer', recipientTeamIds: ['not-a-uuid'], amount: '1.00' }).success, false)
})

test('invalid, self, unknown, overspending, and stale-token transfers reject without mutation', () => {
  const state = start()
  state.teams[0].balance = '199'
  const unchanged = JSON.stringify(state)
  const rejectUnchanged = (teamId: string, token: string, recipientTeamIds: string[], amount: string | number) => {
    assert.throws(() => applyAction(state, teamId, token, { type: 'money.transfer', recipientTeamIds, amount }, env()))
    assert.equal(JSON.stringify(state), unchanged)
  }

  rejectUnchanged('a', state.current.token, ['a'], '0.01')
  rejectUnchanged('a', state.current.token, ['missing'], '0.01')
  rejectUnchanged('a', state.current.token, [], '0.01')
  rejectUnchanged('a', state.current.token, ['b', 'b'], '0.02')
  rejectUnchanged('a', state.current.token, ['b', 'c'], '0.01') // less than one cent per recipient
  rejectUnchanged('a', state.current.token, ['b', 'c'], '2.00') // overspend rejects the whole batch
  rejectUnchanged('a', state.current.token, ['b'], '0')
  rejectUnchanged('a', state.current.token, ['b'], '-0.01')
  rejectUnchanged('a', state.current.token, ['b'], '0.001')
  rejectUnchanged('a', state.current.token, ['b'], 'invalid')
  rejectUnchanged('a', 'outdated-token', ['b'], '0.01')
})

test('transfers work while ready, after a choice, and between rounds, but are blocked during reveal and after finish', () => {
  const state = start()
  state.teams[0].balance = '10000'
  const allowedForLeader = () => playerView('s', 'night', state, 'alice').allowedActions
  const transferAllowed = () => assert.ok(allowedForLeader().includes('money.transfer'))

  transferAllowed() // host-prepared round
  action(state, 'a', ['b', 'c'], '1.02')
  assert.equal(state.teams[0].balance, '9898')
  startRoundEngine(state, env())
  transferAllowed() // active choice phase
  action(state, 'a', ['b'], '1.00')
  applyAction(state, 'a', state.current.token, { type: 'bonus.take', amount: 0 }, env())
  transferAllowed() // choice already submitted
  action(state, 'a', ['b'], '1.00')
  state.current.phase = 'complete'
  transferAllowed() // round complete, waiting for the host
  action(state, 'a', ['b'], '1.00')
  state.reveal = { id: 'reveal-1', rankings: [], acknowledged: [] }
  assert.ok(!allowedForLeader().includes('money.transfer'))
  const paused = JSON.stringify(state)
  assert.throws(() => action(state, 'a', ['b'], '1.00'), /reveal/i)
  assert.equal(JSON.stringify(state), paused)
  state.reveal = null

  state.gameIndex = 4
  state.round = 3
  state.status = 'finished'
  state.current = { game: 'bomb', phase: 'complete', token: 'finished', choices: {}, recipient: null, direction: null }
  assert.ok(!allowedForLeader().includes('money.transfer'))
  assert.throws(() => action(state), /finished/i)
})

test('transfers leave cave timing and circle or finale decisions untouched', () => {
  const state = start()
  state.teams[0]!.balance = '10000'
  state.gameIndex = 2
  state.current = {
    game: 'cave', token: 'cave-window', phase: 'cave', tick: 3, stage: 'decisions', nextTickAt: 50_000,
    inside: ['a', 'b'], unbanked: '2500', decisions: { b: 'stay' }, banked: { a: '500', b: '0', c: '0' }, collapsed: false,
  }
  let before = structuredClone(state.current)
  action(state, 'a', ['b', 'c'], '0.02')
  assert.deepEqual(state.current, before)

  state.gameIndex = 3
  setCurrent(state, {
    game: 'circle', token: 'circle-return', phase: 'return', next: { a: 'b', b: 'c', c: 'a' }, sender: { a: 'c', b: 'a', c: 'b' },
    transfers: { a: { money: '100', stars: 0 } }, returns: {}, received: { a: { money: '100', stars: 0 } }, returned: {},
  })
  before = structuredClone(state.current)
  action(state, 'a', ['b', 'c'], '0.02')
  assert.deepEqual(state.current, before)

  state.gameIndex = 4
  state.advantagedTeamId = 'a'
  setCurrent(state, { game: 'bomb', token: 'bomb-choice', phase: 'choices', choices: {}, recipient: null, direction: null })
  before = structuredClone(state.current)
  action(state, 'a', ['b', 'c'], '0.02')
  assert.deepEqual(state.current, before)
})

test('only own incoming and outgoing receipts appear in either teammate view', () => {
  const state = start()
  state.teams[0]!.balance = '2000'
  state.teams[1]!.balance = '1900'
  state.teams[2]!.balance = '3000'
  action(state, 'a', ['b'], '1.25')
  assert.ok(!('rank' in playerView('s', 'night', state, 'alice').team!))
  assert.ok(!('rank' in playerView('s', 'night', state, 'bob').team!))
  action(state, 'b', ['a'], '2.50')
  const alice = playerView('s', 'night', state, 'alice')
  const alexa = playerView('s', 'night', state, 'alexa')
  const bob = playerView('s', 'night', state, 'bob')
  const casey = playerView('s', 'night', state, 'casey')

  assert.deepEqual(alice.moneyTransfers, alexa.moneyTransfers)
  assert.deepEqual(alice.moneyTransfers.map(({ fromTeamId, toTeamId, amount }) => ({ fromTeamId, toTeamId, amount })), [
    { fromTeamId: 'a', toTeamId: 'b', amount: '1.25' },
    { fromTeamId: 'b', toTeamId: 'a', amount: '2.50' },
  ])
  assert.deepEqual(bob.moneyTransfers.map(({ fromTeamId, toTeamId, amount }) => ({ fromTeamId, toTeamId, amount })), [
    { fromTeamId: 'a', toTeamId: 'b', amount: '1.25' },
    { fromTeamId: 'b', toTeamId: 'a', amount: '2.50' },
  ])
  assert.deepEqual(casey.moneyTransfers, [])
  for (const view of [alice, alexa, bob, casey]) {
    assert.ok(!('balance' in view.teams[0]!))
    assert.ok(!('rank' in view.teams[1]!))
  }
  assert.ok(!('rank' in alice.team!))
  assert.ok(!('rank' in bob.team!))
  assert.equal(alice.earnings.length, 0)
})

test('star trading opens after circle round three and during prepared bomb round one only', () => {
  const state = start()
  state.gameIndex = 3
  state.round = 3
  state.current = { game: 'circle', phase: 'complete', token: 'circle-done', transfers: {}, returns: {}, received: {}, returned: {}, next: { a: 'b', b: 'c', c: 'a' }, sender: { a: 'c', b: 'a', c: 'b' } }
  state.teams[0]!.stars = 4
  assert.equal(playerView('s', 'night', state, 'alice').starsTransferOpen, true)
  assert.ok(playerView('s', 'night', state, 'alice').allowedActions.includes('stars.transfer'))
  applyAction(state, 'a', state.current.token, { type: 'stars.transfer', recipientTeamId: 'b', stars: 3 }, env())
  assert.deepEqual(state.teams.map(team => team.stars), [1, 3, 0])
  assert.equal(state.current.token, 'circle-done')

  state.gameIndex = 4
  state.round = 1
  state.current = { game: 'bomb', phase: 'ready', token: 'bomb-ready' }
  assert.equal(playerView('s', 'night', state, 'alice').starsTransferOpen, true)
  applyAction(state, 'b', state.current.token, { type: 'stars.transfer', recipientTeamId: 'c', stars: 2 }, env())
  startRoundEngine(state, env())
  assert.notEqual(state.advantagedTeamId, null)
  assert.equal(playerView('s', 'night', state, 'alice').starsTransferOpen, false)
  assert.ok(!playerView('s', 'night', state, 'alice').allowedActions.includes('stars.transfer'))
  const before = JSON.stringify(state)
  assert.throws(() => applyAction(state, 'a', state.current.token, { type: 'stars.transfer', recipientTeamId: 'b', stars: 1 }, env()), /only open/i)
  assert.equal(JSON.stringify(state), before)
})

test('star transfers reject invalid, self, unknown, overlarge, reveal-paused and out-of-window actions without mutation', () => {
  const state = start('bomb')
  state.teams[0]!.stars = 3
  const action = { type: 'stars.transfer' as const, recipientTeamId: 'b', stars: 1 }
  state.current = { game: 'bomb', phase: 'choices', token: 'bomb-active', choices: {}, recipient: null, direction: null }
  const unchanged = JSON.stringify(state)
  assert.throws(() => applyAction(state, 'a', state.current.token, action, env()), /only open/i)
  assert.equal(JSON.stringify(state), unchanged)

  state.current = { game: 'bomb', phase: 'ready', token: 'ready' }
  const rejectUnchanged = (recipientTeamId: string, stars: number) => {
    const before = JSON.stringify(state)
    assert.throws(() => applyAction(state, 'a', state.current.token, { type: 'stars.transfer', recipientTeamId, stars }, env()))
    assert.equal(JSON.stringify(state), before)
  }
  rejectUnchanged('a', 1)
  rejectUnchanged('missing', 1)
  rejectUnchanged('b', 0)
  rejectUnchanged('b', 4)
  assert.equal(gameActionSchema.safeParse({ type: 'stars.transfer', recipientTeamId: '123e4567-e89b-42d3-a456-426614174000', stars: 1 }).success, true)
  assert.equal(gameActionSchema.safeParse({ type: 'stars.transfer', recipientTeamId: 'bad', stars: 1 }).success, false)

  state.reveal = { id: 'public', rankings: [], acknowledged: [] }
  assert.equal(playerView('s', 'night', state, 'alice').starsTransferOpen, false)
  const beforeReveal = JSON.stringify(state)
  assert.throws(() => applyAction(state, 'a', state.current.token, action, env()), /acknowledge/i)
  assert.equal(JSON.stringify(state), beforeReveal)
})

test('nonleaders cannot transfer, teammates share their receipt history, and reset restores the game checkpoint', () => {
  const state = start('bomb')
  state.teams[0].balance = '10000'
  state.teams[1].balance = '4000'
  // The checkpoint already includes an earlier receipt that this reset must retain.
  state.gameStart!.accounts.a.balance = '10000'
  state.gameStart!.accounts.b.balance = '4000'
  const priorReceipt = { id: 'prior-transfer', fromTeamId: 'b', toTeamId: 'a', amount: '500' }
  state.gameStart!.moneyTransfersLength = 1
  state.moneyTransfers = [priorReceipt]
  const token = state.current.token

  action(state, 'a', ['b'], '10.00')
  const leader = playerView('s', 'night', state, 'alice')
  const teammate = playerView('s', 'night', state, 'alexa')
  assert.ok(leader.allowedActions.includes('money.transfer'))
  assert.ok(!teammate.allowedActions.includes('money.transfer'))
  assert.equal(leader.moneyTransfers.length, 2)
  assert.equal(teammate.moneyTransfers.length, 2)
  assert.equal(state.current.token, token)

  resetCurrentGame(state, env())
  assert.deepEqual(state.teams.map((team) => team.balance), ['10000', '4000', '0'])
  assert.deepEqual(state.moneyTransfers, [priorReceipt])
})

test('old states without a transfer ledger remain usable and reset safely when the checkpoint has no ledger length', () => {
  const state = start()
  delete state.moneyTransfers
  delete state.gameStart!.moneyTransfersLength
  state.teams[0].balance = '1000'
  action(state, 'a', ['b'], '0.25')
  assert.equal(state.teams[0].balance, '975')
  assert.equal(state.teams[1].balance, '25')
  assert.equal(playerView('s', 'night', state, 'alice').moneyTransfers.length, 1)
  resetCurrentGame(state, env())
  assert.deepEqual(state.moneyTransfers, [])
  assert.deepEqual(state.teams.map((team) => team.balance), ['0', '0', '0'])
})
