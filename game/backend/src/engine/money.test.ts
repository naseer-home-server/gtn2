import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyAction, refreshPotTarget, startEngine } from './index.js'
import { DEFAULT_CONFIG } from './config.js'
import { cents, moneyDivide, moneyMultiply, moneyMultiplyMany, moneyScale, units } from './money.js'
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
  const token = state.current.token
  applyAction(state, 'a', token, { type: 'bonus.take', amount: '0.01' }, env())
  applyAction(state, 'b', token, { type: 'bonus.take', amount: 0 }, env())
  applyAction(state, 'c', token, { type: 'bonus.take', amount: 0 }, env())
  assert.equal(state.history.at(-1)?.payouts.a, '3')
  assert.equal(state.teams[0].balance, '3')
})

test('reveal pot target rounds exact average earnings times its multiplier once', () => {
  const { teams, config } = fixture(2)
  config.revealPotMultiplier = 1.5
  const { state } = startEngine(teams, config, env())
  state.teams[0].balance = '1'
  state.teams[1].balance = '2'
  refreshPotTarget(state)
  // Three cents across two teams, scaled by 1.5, is 2.25 cents and rounds to 2.
  assert.equal(state.pot.target, moneyScale('3', 1.5, 2))
  assert.equal(state.pot.target, '2')
  applyAction(state, 'a', state.current.token, { type: 'pot.contribute', amount: '0.01' }, env())
  assert.equal(state.pot.amount, '1')
  assert.equal(state.pot.target, '2')
  // Pot spending is excluded from balances but restored into the earnings basis.
  refreshPotTarget(state)
  assert.equal(state.pot.target, '2')
})
