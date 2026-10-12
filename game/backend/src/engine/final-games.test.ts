import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actFinalGame, startFinalGame } from './final-games.js'
import type { EngineEnv, EngineState, Team } from './types.js'

function fixture(gameIndex = 3, teamCount = 4): EngineState {
  const teams: Team[] = Array.from({ length: teamCount }, (_, index) => ({
    id: String.fromCharCode(97 + index), name: `Team ${index + 1}`, playerIds: [`p${index}`],
    tieOrder: index, balance: '10000', stars: index === 0 ? 3 : 1,
  }))
  return {
    version: 1, revision: 0, status: 'playing', gameIndex, round: 1,
    config: {
      initialBalance: 0, revealPotMultiplier: 1,
      bonus: { bag: [1, 1, 1], threshold: [1, 1, 1], multiplier: [1, 1, 1], stars: 0 },
      highLow: { pool: [1, 1, 1], multiplier: [1, 1, 1], stars: 0 },
      cave: { startingMoney: [1, 1, 1], growth: [2, 2, 2], tickSeconds: 10, collapseRisk: [0, 0, 0, 0, 0], stars: 0 },
      circle: { multiplier: [3, 5, 10] },
      bomb: { minChits: 1, maxChits: 20, advantageChits: 60, factor: [2, 5, 10] },
    },
    teams, current: { game: 'bonus', token: 'old', phase: 'complete', choices: {} },
    history: [], caveTotals: {}, advantagedTeamId: null, pot: { amount: '0', target: '0' }, reveal: null,
  }
}

function env(randomValues: number[] = []): EngineEnv {
  let i = 0
  let token = 0
  return { now: 123, random: () => randomValues[i++] ?? 0, token: () => `token-${++token}` }
}

function cycleSizes(next: Record<string, string>) {
  const unseen = new Set(Object.keys(next))
  const sizes: number[] = []
  while (unseen.size) {
    const start = unseen.values().next().value as string
    let at = start
    let size = 0
    do {
      unseen.delete(at)
      at = next[at]
      size++
    } while (at !== start)
    sizes.push(size)
  }
  return sizes.sort((a, b) => a - b)
}

test('circle reshuffles every round into only valid circles', () => {
  const state = fixture(3, 5)
  startFinalGame(state, env([0, 0, 0, 0, 0]))
  assert.deepEqual(cycleSizes(state.current.phase !== 'ready' && state.current.game === 'circle' ? state.current.next : {}), [2, 3])
  const firstNext = state.current.phase !== 'ready' && state.current.game === 'circle' ? { ...state.current.next } : {}

  state.round = 2
  startFinalGame(state, env([0, 0.99, 0, 0, 0]))
  assert.deepEqual(cycleSizes(state.current.phase !== 'ready' && state.current.game === 'circle' ? state.current.next : {}), [2, 3])
  assert.notDeepEqual(state.current.phase !== 'ready' && state.current.game === 'circle' ? state.current.next : {}, firstNext)
})

test('circle debits submissions, multiplies money and stars, and settles simultaneous returns with net history', () => {
  const state = fixture(3, 2)
  state.teams[0].balance = '1000'
  state.teams[1].balance = '800'
  state.teams[0].stars = 4
  state.teams[1].stars = 2
  const testEnv = env([0, 0, 0, 0])
  startFinalGame(state, testEnv)
  const next = state.current.phase !== 'ready' && state.current.game === 'circle' ? state.current.next : {}
  const senderForA = state.current.phase !== 'ready' && state.current.game === 'circle' ? state.current.sender.a : ''
  assert.notEqual(senderForA, 'a')

  actFinalGame(state, 'a', { type: 'circle.send', money: 2, stars: 1 }, testEnv)
  assert.equal(state.teams[0].balance, '800')
  assert.equal(state.current.phase, 'transfer')
  const resolved = actFinalGame(state, 'b', { type: 'circle.send', money: 1, stars: 2 }, testEnv)
  assert.equal(state.current.phase, 'return')
  assert.equal(state.current.token, 'token-2')
  assert.equal(state.teams.find((item) => item.id === next.a)?.balance, '1300')
  assert.equal(resolved.filter((event) => event.type === 'circle.transfer_received').length, 2)

  for (const team of state.teams) actFinalGame(state, team.id, { type: 'circle.return', money: 1, stars: 1 }, testEnv)
  assert.equal(state.current.phase, 'complete')
  const result = state.history.at(-1)!
  assert.equal(result.game, 'circle')
  assert.equal(BigInt(result.payouts.a) + BigInt(result.payouts.b), 600n)
  assert.equal(state.teams.reduce((sum, item) => sum + BigInt(item.balance), 0n), 2400n)
  assert.deepEqual(Object.keys(result.payouts).sort(), ['a', 'b'])
})

test('circle rejects overdraws and duplicate submissions', () => {
  const state = fixture(3, 2)
  startFinalGame(state, env())
  assert.throws(() => actFinalGame(state, 'a', { type: 'circle.send', money: 1000, stars: 0 }, env()), /exceeds/)
  actFinalGame(state, 'a', { type: 'circle.send', money: 0, stars: 0 }, env())
  assert.throws(() => actFinalGame(state, 'a', { type: 'circle.send', money: 0, stars: 0 }, env()), /already sent/)
})

test('bomb freezes the most-starred tie winner, draws direction and recipient from separate weighted piles, and records signed deltas', () => {
  const state = fixture(4, 3)
  state.teams[0].stars = 5
  state.teams[1].stars = 5
  state.teams[1].tieOrder = 0
  state.teams[0].tieOrder = 1
  state.teams[1].balance = '1000'
  const startEvents = startFinalGame(state, env())
  assert.equal(state.advantagedTeamId, 'b')
  assert.equal(startEvents.find((event) => event.type === 'bomb.advantage_revealed')?.data.teamId, 'b')

  const choices = [
    ['a', { up: 1, down: 0, recipients: { b: 1 } }],
    ['b', { up: 0, down: 2, recipients: { b: 2 } }],
    ['c', { up: 1, down: 0, recipients: { a: 1 } }],
  ] as const
  for (const [teamId, choice] of choices.slice(0, 2)) actFinalGame(state, teamId, { type: 'bomb.allocate', ...choice }, env())
  const finalEvents = actFinalGame(state, 'c', { type: 'bomb.allocate', ...choices[2][1] }, env([0, 0.5]))
  assert.equal(state.current.phase, 'complete')
  assert.equal(state.current.game, 'bomb')
  assert.equal(state.current.recipient, 'b')
  assert.equal(state.current.direction, 'up')
  assert.equal(state.teams[1].balance, '2000')
  assert.equal(state.history.at(-1)?.payouts.b, '1000')
  assert.equal(finalEvents.some((event) => event.type === 'bomb.resolved'), true)
})

test('bomb permits zero individual options but enforces whole-number totals, known recipients, and advantage limits', () => {
  const state = fixture(4, 2)
  startFinalGame(state, env())
  assert.equal(state.advantagedTeamId, 'a')
  assert.throws(() => actFinalGame(state, 'b', { type: 'bomb.allocate', up: 0, down: 0, recipients: { a: 1 } }, env()), /Total chits/)
  assert.throws(() => actFinalGame(state, 'b', { type: 'bomb.allocate', up: 1, down: 0, recipients: { missing: 1 } }, env()), /not in this session/)
  actFinalGame(state, 'b', { type: 'bomb.allocate', up: 0, down: 1, recipients: { a: 1, b: 0 } }, env())
  assert.throws(() => actFinalGame(state, 'a', { type: 'bomb.allocate', up: 61, down: 0, recipients: { a: 1 } }, env()), /Total chits/)
  actFinalGame(state, 'a', { type: 'bomb.allocate', up: 60, down: 0, recipients: { a: 1 } }, env())
  assert.equal(state.current.phase, 'complete')
})

test('bomb down factor rounds to cents and stores a negative per-team change', () => {
  const state = fixture(4, 2)
  state.teams[1].balance = '101'
  startFinalGame(state, env())
  actFinalGame(state, 'a', { type: 'bomb.allocate', up: 0, down: 1, recipients: { b: 1 } }, env())
  actFinalGame(state, 'b', { type: 'bomb.allocate', up: 0, down: 1, recipients: { b: 1 } }, env([0, 0]))
  assert.equal(state.teams[1].balance, '51')
  assert.equal(state.history.at(-1)?.payouts.b, '-50')
})

test('circle and bomb keep money exact above JavaScript safe integer range', () => {
  const state = fixture(3, 2)
  state.teams[0].balance = '90071992547409910'
  state.teams[1].balance = '90071992547409910'
  const testEnv = env([0, 0, 0, 0])
  startFinalGame(state, testEnv)
  actFinalGame(state, 'a', { type: 'circle.send', money: '900719925474099.10', stars: 0 }, testEnv)
  actFinalGame(state, 'b', { type: 'circle.send', money: '900719925474099.10', stars: 0 }, testEnv)
  assert.equal(state.teams[0].balance, '270215977642229730')
  assert.equal(state.teams[1].balance, '270215977642229730')
  for (const team of state.teams) actFinalGame(state, team.id, { type: 'circle.return', money: 0, stars: 0 }, testEnv)

  const bomb = fixture(4, 2)
  bomb.teams[1].balance = '90071992547409910'
  const bombEnv = env([0, 0])
  startFinalGame(bomb, bombEnv)
  actFinalGame(bomb, 'a', { type: 'bomb.allocate', up: 1, down: 0, recipients: { b: 1 } }, bombEnv)
  actFinalGame(bomb, 'b', { type: 'bomb.allocate', up: 1, down: 0, recipients: { b: 1 } }, bombEnv)
  assert.equal(bomb.teams[1].balance, '180143985094819820')
})
