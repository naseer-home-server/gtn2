import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_CONFIG, playerView, startEngine, startRoundEngine, tickEngine } from 'backend/engine'
import { currentRuleCard, gameRuleCard } from './rules.js'

test('cave player views and simulation rules expose the configured deadline and automatic banking', () => {
  const config = structuredClone(DEFAULT_CONFIG)
  config.cave.maxTicks = 3
  config.cave.collapseRisk = [0, 0, 0, 0, 0]
  const env = { now: 0, random: () => 0.99, token: () => 'tick-token' }
  const { state } = startEngine(['a', 'b'].map((id, tieOrder) => ({ id, name: id, playerIds: [id], tieOrder, balance: '0', stars: 0 })), config, env, 'cave')
  startRoundEngine(state, env)
  for (const now of [10_000, 20_000]) tickEngine(state, { ...env, now })
  const view = playerView('session', 'Cave rules', state, 'a')
  assert.equal(view.roundState?.tick, 3)
  assert.equal(view.rules?.maxTicks, 3)
  const card = currentRuleCard(view, DEFAULT_CONFIG)
  assert.match(card, /At most 3 decision windows/)
  assert.match(card, /Current tick: 3 of 3/)
  assert.match(card, /every team still inside automatically banks/)
  assert.match(card, /no further collapse check, growth, or tick 4/)
  assert.equal(view.rules?.inside, undefined)
})

test('simulation rules describe all seven departure risks and equal circle-size groupings', () => {
  const cave = gameRuleCard('cave', 1, DEFAULT_CONFIG)
  assert.match(cave, /0 \/ 1 \/ 2 \/ 3 \/ 4 \/ 5 \/ 6 teams already departed/)
  const configuredRisks = DEFAULT_CONFIG.cave.collapseRisk.map(risk => `${risk}%`).join(' / ')
  assert.ok(cave.includes(configuredRisks), 'the simulation card reflects the shared engine config')
  assert.match(gameRuleCard('circle', 1, DEFAULT_CONFIG), /Each valid combination of circle sizes is equally likely/)
  assert.match(gameRuleCard('circle', 1, DEFAULT_CONFIG), /7, 5\+2, 4\+3, or 3\+2\+2/)
})
