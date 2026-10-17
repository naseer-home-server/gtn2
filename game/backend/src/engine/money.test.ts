import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceEngine, applyAction, refreshPotTarget, startEngine, startRoundEngine } from './index.js'
import { DEFAULT_CONFIG } from './config.js'
import { cents, moneyDivide, moneyMultiply, moneyMultiplyMany, units } from './money.js'
import type { EngineEnv, Team } from './types.js'

function env(): EngineEnv {
  let token = 0
  return { now: 1_000, random: () => 0.5, token: () => `money-${++token}` }
}

function fixture(count = 3) {
  const teams: Team[] = Array.from({ length: count }, (_, index) => ({
    id: String.fromCharCode(97 + index), name: `Team ${index + 1}`, playerIds: [`p${index}`], tieOrder: index, balance: '0', stars: 0,
  }))
  return { teams, config: structuredClone(DEFAULT_CONFIG) }
}

test('money arithmetic remains exact for very large growth and weighted factors', () => {
  let amount = '9007199254740991'
  for (let tick = 0; tick < 100; tick++) amount = moneyMultiply(amount, 4)
  const exact = 9007199254740991n * 4n ** 100n
  assert.equal(amount, exact.toString())
  assert.equal(moneyDivide(amount, 10), ((exact + 5n) / 10n).toString())
  assert.equal(moneyMultiply('9007199254740991', 5), '45035996273704955')
})

test('money rounds half cents away from zero and rounds compound factors once', () => {
  assert.equal(cents('0.004'), '0')
  assert.equal(cents('0.005'), '1')
  assert.equal(cents('1.005'), '101')
  assert.equal(moneyMultiply('1', 1.5), '2')
  assert.equal(moneyMultiplyMany('1', 1.5, 2), '3')
  assert.equal(moneyMultiplyMany('-1', 1.5, 2), '-3')
  assert.equal(units(moneyDivide('5', 2)), '0.03')
})

test('fractional bonus multiplier and zero-taker factor compound before rounding', () => {
  const { teams, config } = fixture()
  config.bonus.multiplier[0] = 1.5
  config.bonus.threshold[0] = 100
  const { state } = startEngine(teams, config, env())
  startRoundEngine(state, env())
  const token = state.current.token
  applyAction(state, 'a', token, { type: 'bonus.take', amount: '0.01' }, env())
  applyAction(state, 'b', token, { type: 'bonus.take', amount: 0 }, env())
  applyAction(state, 'c', token, { type: 'bonus.take', amount: 0 }, env())
  assert.equal(state.history.at(-1)?.payouts.a, '3')
  assert.equal(state.teams[0].balance, '3')
})

test('reveal prices use one third of the median balance, round once to hundreds, and retain a positive-balance minimum', () => {
  for (const count of [2, 3, 4, 5]) {
    const { teams, config } = fixture(count)
    const { state } = startEngine(teams, config, env())
    for (const [balance, target] of [
      ['0', '0'], ['1', '10000'], ['44999', '10000'], ['45000', '20000'],
      ['104999', '30000'], ['105000', '40000'], ['120000', '40000'],
      ['900719925474099150000', '300239975158033050000'],
    ]) {
      for (const team of state.teams) team.balance = balance
      refreshPotTarget(state)
      assert.equal(state.pot.target, target, `${count} teams with ${balance} cents each`)
      for (const team of state.teams) assert.equal(state.privatePots?.[team.id]?.target, (BigInt(target) / 5n).toString())
    }
    // Equal balances have the same median regardless of team count.
    for (const team of state.teams) team.balance = '120000'
    refreshPotTarget(state)
    assert.equal(state.pot.target, '40000')
  }
})

test('odd and even team counts use the median, including the mean of the two middle balances', () => {
  for (const balances of [
    ['0', '120000', '900000'],
    ['0', '100000', '500000', '1000000'],
  ]) {
    const { teams, config } = fixture(balances.length)
    const { state } = startEngine(teams, config, env())
    state.teams.forEach((team, index) => { team.balance = balances[index]! })
    refreshPotTarget(state)
    assert.equal(state.pot.target, balances.length === 3 ? '40000' : '100000')
  }
})

test('reveal pot tuning scales one third of the median before rounding', () => {
  const { teams, config } = fixture(2)
  config.revealPotMultiplier = 1.5
  const { state } = startEngine(teams, config, env())
  for (const team of state.teams) team.balance = '120000'
  refreshPotTarget(state)
  assert.equal(state.pot.target, '60000')
  assert.equal(state.privatePots?.a?.target, '12000')
})

test('both reveal pots reduce the next game price basis while prices stay fixed throughout a game', () => {
  const { teams, config } = fixture(2)
  config.initialBalance = 1050
  const e = env()
  const { state } = startEngine(teams, config, e)
  assert.equal(state.pot.target, '10000')
  assert.equal(state.privatePots?.a?.target, '2000')
  applyAction(state, 'a', state.current.token, { type: 'pot.contribute', scope: 'self', amount: 20 }, e)
  applyAction(state, 'b', state.current.token, { type: 'pot.contribute', scope: 'public', amount: 100 }, e)
  for (const team of state.teams) applyAction(state, team.id, state.current.token, { type: 'reveal.acknowledge' }, e)
  assert.deepEqual(state.potSpent, { a: '2000', b: '10000' })

  for (let round = 1; round <= 3; round++) {
    startRoundEngine(state, e)
    for (const team of state.teams) applyAction(state, team.id, state.current.token, { type: 'bonus.take', amount: 0 }, e)
    assert.equal(state.pot.target, '10000')
    assert.equal(state.privatePots?.a?.target, '2000')
    advanceEngine(state, e, true)
  }
  assert.equal(state.current.game, 'high-low')
  // The two-team median is $990: /3 = $330 -> $300. Adding spending back would give $400.
  assert.equal(state.pot.target, '30000')
  for (const team of state.teams) assert.equal(state.privatePots?.[team.id]?.target, '6000')
})
