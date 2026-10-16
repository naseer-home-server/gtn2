import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actEarlyGame, startEarlyGame, tickCave } from './early-games.js'
import { DEFAULT_CONFIG, gameConfigSchema } from './config.js'
import { tickEngine } from './index.js'
import type { CaveRound, EngineEnv, EngineState, Team } from './types.js'

const teams = (): Team[] => [
  { id: 'a', name: 'A', playerIds: [], tieOrder: 0, balance: '0', stars: 0 },
  { id: 'b', name: 'B', playerIds: [], tieOrder: 1, balance: '0', stars: 0 },
]
const config = () => ({
  initialBalance: 0, revealPotMultiplier: 1,
  bonus: { bag: [100, 100, 100] as [number, number, number], threshold: [100, 100, 100] as [number, number, number], multiplier: [3, 5, 10] as [number, number, number], stars: 1 },
  highLow: { pool: [100, 100, 100] as [number, number, number], multiplier: [2, 5, 10] as [number, number, number], stars: 2 },
  cave: { startingMoney: [5, 10, 25] as [number, number, number], growth: [2, 3, 4] as [number, number, number], tickSeconds: 10, maxTicks: 10, collapseRisk: [0, 0, 0, 0, 0] as [number, number, number, number, number], stars: 3 },
  circle: { multiplier: [3, 5, 10] as [number, number, number] },
  bomb: { minChits: 1, maxChits: 20, advantageChits: 60, factor: [2, 5, 10] as [number, number, number] },
})
const state = (game: EngineState['current']['game'], round = 1): EngineState => ({
  version: 1, revision: 0, status: 'playing', config: config(), teams: teams(), gameIndex: 0, round,
  current: { game, token: 'old', phase: 'complete' } as EngineState['current'], history: [], caveTotals: { a: '0', b: '0' },
  advantagedTeamId: null, pot: { amount: '0', target: '0' }, reveal: null,
})
const env = (now = 0, random = () => 0.99): EngineEnv => ({ now, random, token: () => 'new-token' })

test('bonus applies threshold and zero-taker bonuses independently and records private choices in history', () => {
  const s = state('bonus')
  startEarlyGame(s, env())
  assert.deepEqual(actEarlyGame(s, 'a', { type: 'bonus.take', amount: 20 }, env()), [{ type: 'bonus.choice', data: { teamId: 'a', amount: '2000' } }])
  const events = actEarlyGame(s, 'b', { type: 'bonus.take', amount: 0 }, env())
  assert.equal(s.history[0].payouts.a, '6000') // $20 x 3 x one zero taker
  assert.equal(s.history[0].payouts.b, '0')
  assert.equal(s.teams[0].balance, '6000')
  assert.equal(s.current.phase, 'complete')
  assert.ok(events.some((event) => event.type === 'round.completed'))
  assert.deepEqual(s.history[0].details.choices, { a: '2000', b: '0' })
})

test('bonus uses the multiplier of zero takers even when the collective threshold is exceeded', () => {
  const s = state('bonus')
  startEarlyGame(s, env())
  s.config.bonus.threshold[0] = 10
  actEarlyGame(s, 'a', { type: 'bonus.take', amount: 20 }, env())
  actEarlyGame(s, 'b', { type: 'bonus.take', amount: 0 }, env())
  assert.equal(s.history[0].payouts.a, '2000')
  assert.equal(s.history[0].details.thresholdBonus, 1)
})

test('bonus combines fractional threshold and zero-taker multipliers before cent rounding', () => {
  const s = state('bonus')
  s.config.bonus.multiplier[0] = 1.5
  s.teams.push({ id: 'c', name: 'C', playerIds: [], tieOrder: 2, balance: '0', stars: 0 })
  s.teams.push({ id: 'd', name: 'D', playerIds: [], tieOrder: 3, balance: '0', stars: 0 })
  startEarlyGame(s, env())
  actEarlyGame(s, 'a', { type: 'bonus.take', amount: '0.01' }, env())
  for (const id of ['b', 'c', 'd']) actEarlyGame(s, id, { type: 'bonus.take', amount: 0 }, env())
  assert.equal(s.history[0].payouts.a, '5') // 1 cent × 1.5 × 3 = 4.5 cents, rounded once
  assert.equal(s.history[0].details.zeroTakers, 3)
  assert.equal(s.history[0].details.thresholdBonus, 1.5)

  const overThreshold = state('bonus')
  overThreshold.config.bonus.threshold[0] = 0
  overThreshold.config.bonus.multiplier[0] = 1.5
  overThreshold.teams.push({ id: 'c', name: 'C', playerIds: [], tieOrder: 2, balance: '0', stars: 0 })
  overThreshold.teams.push({ id: 'd', name: 'D', playerIds: [], tieOrder: 3, balance: '0', stars: 0 })
  startEarlyGame(overThreshold, env())
  actEarlyGame(overThreshold, 'a', { type: 'bonus.take', amount: '0.01' }, env())
  for (const id of ['b', 'c', 'd']) actEarlyGame(overThreshold, id, { type: 'bonus.take', amount: 0 }, env())
  assert.equal(overThreshold.history[0].payouts.a, '3') // threshold bonus falls to 1; zero-taker factor still applies
  assert.equal(overThreshold.history[0].details.thresholdBonus, 1)
  assert.equal(overThreshold.history[0].details.zeroTakers, 3)
})

test('high-low pays the tie-order lowest chooser the highest chosen amount', () => {
  const s = state('high-low')
  startEarlyGame(s, env())
  actEarlyGame(s, 'b', { type: 'high-low.choose', amount: 30 }, env())
  actEarlyGame(s, 'a', { type: 'high-low.choose', amount: 10 }, env())
  assert.deepEqual(s.history[0].payouts, { a: '3000', b: '1000' })
  assert.equal(s.teams[0].balance, '3000')
})

test('third-round high-low stars go to the selected low chooser', () => {
  const s = state('high-low', 3)
  startEarlyGame(s, env())
  actEarlyGame(s, 'a', { type: 'high-low.choose', amount: 10 }, env())
  actEarlyGame(s, 'b', { type: 'high-low.choose', amount: 30 }, env())
  assert.equal(s.teams[0].stars, 2)
  assert.equal(s.teams[1].stars, 0)
})

test('cave starts with a safe decision window, pauses during reveal, grows on one due tick, and banks leavers immediately', () => {
  const s = state('cave')
  startEarlyGame(s, env(100))
  const cave = s.current as CaveRound
  assert.equal(cave.game, 'cave')
  assert.equal(cave.tick, 1)
  assert.equal(cave.stage, 'decisions')
  assert.equal(cave.unbanked, '500')
  assert.deepEqual(actEarlyGame(s, 'a', { type: 'cave.decide', decision: 'leave' }, env(101)), [
    { type: 'cave.decision', data: { teamId: 'a', decision: 'leave', tick: 1 } },
    { type: 'cave.earnings', data: { teamId: 'a', amount: '500', banked: '500', balance: '500', tick: 1 } },
  ])
  s.reveal = { id: 'r', rankings: [], acknowledged: [] }
  assert.deepEqual(tickCave(s, env(20_100)), [])
  s.reveal = null
  assert.deepEqual(tickCave(s, env(10_100)).map((event) => event.type), ['cave.default_stay', 'cave.survived'])
  assert.equal(cave.unbanked, '1000')
  assert.equal(cave.tick, 2)
  assert.equal(cave.stage, 'decisions')
  assert.equal(s.teams[0].balance, '500')
  assert.equal(s.caveTotals.a, '500')
  assert.deepEqual(cave.inside, ['b'])
  // No answer from B means B stays through the next tick and the shared pool grows again.
  tickCave(s, env(20_100))
  assert.equal(cave.stage, 'decisions')
  assert.equal(cave.unbanked, '2000')
  assert.deepEqual(cave.inside, ['b'])
})

test('cave cannot collapse before the initial decision window and banks the starting amount before later risk checks', () => {
  const s = state('cave')
  s.config.cave.collapseRisk = [0, 100, 100, 100, 100]
  startEarlyGame(s, env(100))
  const cave = s.current as CaveRound
  assert.equal(cave.stage, 'decisions')
  assert.deepEqual(actEarlyGame(s, 'a', { type: 'cave.decide', decision: 'leave' }, env(101)).map((event) => event.type), ['cave.decision', 'cave.earnings'])
  const events = tickCave(s, env(10_100, () => 0.5))
  assert.ok(events.some((event) => event.type === 'cave.collapsed'))
  assert.equal(s.teams[0].balance, '500')
  assert.equal(s.teams[1].balance, '0')
  assert.deepEqual(s.history[0].payouts, { a: '500', b: '0' })
})

test('cave collapse uses departures from the previous decision window and preserves banked money', () => {
  const s = state('cave')
  s.config.cave.collapseRisk = [0, 100, 100, 100, 100]
  startEarlyGame(s, env())
  tickCave(s, env(10_000, () => 0.99))
  actEarlyGame(s, 'a', { type: 'cave.decide', decision: 'leave' }, env())
  const events = tickCave(s, env(20_000, () => 0.5))
  assert.ok(events.some((event) => event.type === 'cave.collapsed'))
  assert.equal(s.teams[0].balance, '1000')
  assert.equal(s.teams[1].balance, '0')
  assert.deepEqual(s.history[0].payouts, { a: '1000', b: '0' })
  assert.equal(s.current.phase, 'complete')
})

test('cave round-three award uses cumulative banked totals and tie order', () => {
  const s = state('cave', 3)
  s.caveTotals = { a: '1000', b: '1000' }
  startEarlyGame(s, env())
  tickCave(s, env(10_000))
  const events = actEarlyGame(s, 'a', { type: 'cave.decide', decision: 'leave' }, env())
  const ending = actEarlyGame(s, 'b', { type: 'cave.decide', decision: 'leave' }, env())
  assert.equal(s.teams[0].stars, 3)
  assert.equal(s.teams[1].stars, 0)
  assert.ok([...events, ...ending].some((event) => event.type === 'round.completed'))
})

test('the final cave window banks remaining teams once without another risk check or growth', () => {
  const s = state('cave', 3)
  startEarlyGame(s, env())
  const cave = s.current as CaveRound
  actEarlyGame(s, 'a', { type: 'cave.decide', decision: 'leave' }, env())
  for (let tick = 1; tick < 10; tick++) tickCave(s, env(tick * 10_000))
  assert.equal(cave.tick, 10)
  assert.equal(cave.unbanked, String(2500n * 4n ** 9n))
  assert.equal(s.current.phase, 'cave')
  assert.deepEqual(tickCave(s, env(99_999)), [])
  s.config.cave.collapseRisk = [100, 100, 100, 100, 100]
  actEarlyGame(s, 'b', { type: 'cave.decide', decision: 'stay' }, env())
  const finalAmount = cave.unbanked
  const events = tickCave(s, env(100_000, () => { throw new Error('No risk roll is allowed at the limit') }))
  assert.equal(cave.tick, 10)
  assert.equal(cave.unbanked, finalAmount)
  assert.equal(cave.collapsed, false)
  assert.equal(cave.nextTickAt, null)
  assert.deepEqual(cave.inside, [])
  assert.equal(s.current.phase, 'complete')
  assert.deepEqual(s.history[0].payouts, { a: '2500', b: finalAmount })
  assert.equal(s.history[0].details.reason, 'tick-limit')
  assert.equal(s.teams[1].balance, finalAmount)
  assert.equal(s.caveTotals.b, finalAmount)
  assert.equal(s.teams[1].stars, 3)
  assert.ok(events.some(event => event.type === 'cave.earnings' && event.data.automatic === true && event.data.teamId === 'b'))
  assert.equal(events.some(event => event.type === 'cave.survived' || event.type === 'cave.collapsed'), false)
  assert.deepEqual(tickEngine(s, env(110_000)), [])
  assert.equal(s.teams[1].balance, finalAmount)
})

test('a configured one-tick cave banks unanswered teams after its safe opening window', () => {
  const s = state('cave')
  s.config.cave.maxTicks = 1
  startEarlyGame(s, env())
  tickCave(s, env(10_000, () => { throw new Error('The opening window must remain safe') }))
  assert.deepEqual(s.history[0].payouts, { a: '500', b: '500' })
  assert.equal(s.history[0].details.tick, 1)
})

test('cave limits default older configurations to ten and reject invalid window counts', () => {
  const legacy = structuredClone(DEFAULT_CONFIG)
  delete (legacy.cave as Partial<typeof legacy.cave>).maxTicks
  assert.equal(gameConfigSchema.parse(legacy).cave.maxTicks, 10)
  for (const maxTicks of [0, -1, 1.5, 1001]) {
    assert.equal(gameConfigSchema.safeParse({ ...legacy, cave: { ...legacy.cave, maxTicks } }).success, false)
  }
})

test('invalid ranges, duplicate choices, overdue cave ticks, and cent overflow are rejected safely', () => {
  const bonus = state('bonus')
  startEarlyGame(bonus, env())
  assert.throws(() => actEarlyGame(bonus, 'a', { type: 'bonus.take', amount: 101 }, env()), /exceeds/)
  actEarlyGame(bonus, 'a', { type: 'bonus.take', amount: 1 }, env())
  assert.throws(() => actEarlyGame(bonus, 'a', { type: 'bonus.take', amount: 1 }, env()), /already chosen/)

  const cave = state('cave')
  startEarlyGame(cave, env())
  tickCave(cave, env(10_000))
  actEarlyGame(cave, 'a', { type: 'cave.decide', decision: 'stay' }, env())
  assert.throws(() => actEarlyGame(cave, 'a', { type: 'cave.decide', decision: 'stay' }, env()), /already decided/)
  const overdue = tickCave(cave, env(50_000))
  assert.equal(overdue.filter((event) => event.type === 'cave.default_stay').length, 1)
  assert.equal(overdue.filter((event) => event.type === 'cave.survived').length, 1) // one step only, never catch up multiple timers

})

test('cave completes all three rounds, grows beyond safe integers, and awards cumulative tie by arrival order', () => {
  const s = state('cave', 1)
  s.config.cave.maxTicks = 100
  s.config.cave.collapseRisk = [0, 0, 0, 0, 0]
  const playRound = (round: number, ticks: number) => {
    s.round = round
    s.current = { game: 'cave', token: 'next', phase: 'complete', tick: 0, stage: 'ended', nextTickAt: null, inside: [], unbanked: '0', decisions: {}, banked: {}, collapsed: false }
    const opening = 1_000_000 * round
    startEarlyGame(s, env(opening))
    let now = s.current.game === 'cave' ? s.current.nextTickAt! : opening
    for (let tick = 0; tick < ticks; tick++) {
      tickCave(s, env(now))
      const cave = s.current as CaveRound
      now = cave.nextTickAt!
    }
    const cave = s.current as CaveRound
    const finalBank = cave.unbanked
    actEarlyGame(s, 'a', { type: 'cave.decide', decision: 'leave' }, env(now))
    const events = actEarlyGame(s, 'b', { type: 'cave.decide', decision: 'leave' }, env(now))
    assert.equal(s.history.at(-1)?.game, 'cave')
    if (round === 3) {
      assert.equal(s.teams[0].stars, 3)
      assert.equal(s.teams[1].stars, 0)
      assert.ok(events.some((event) => event.type === 'stars.awarded' && event.data.teamId === 'a'))
    }
    return finalBank
  }

  playRound(1, 1)
  playRound(2, 1)
  const finalBank = playRound(3, 55)
  assert.ok(BigInt(finalBank) > BigInt(Number.MAX_SAFE_INTEGER))
  assert.equal(s.caveTotals.a, s.caveTotals.b)
  assert.equal(s.teams[0].balance, s.teams[1].balance)
})
