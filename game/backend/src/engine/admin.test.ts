import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startEngine } from './index.js'
import { DEFAULT_CONFIG } from './config.js'
import { adjustTeamAccount, applyUpcomingConfig } from './admin.js'
import type { EngineEnv, EngineState, GameConfig, GameId, Team } from './types.js'

const teams: Team[] = [
  { id: 'amber', name: 'Amber', playerIds: ['alice'], tieOrder: 0, balance: '0', stars: 0 },
  { id: 'blue', name: 'Blue', playerIds: ['bob'], tieOrder: 1, balance: '0', stars: 0 },
]
const env: EngineEnv = { now: 1_000, random: () => 0.5, token: () => 'token' }
function prepared(game: GameId = 'bonus'): EngineState {
  return startEngine(structuredClone(teams), structuredClone(DEFAULT_CONFIG), env, game).state
}
function completeRoundThree(state: EngineState, game: GameId): EngineState {
  state.gameIndex = ['bonus', 'high-low', 'cave', 'circle', 'bomb'].indexOf(game)
  state.round = 3
  state.current = { game, phase: 'complete', token: 'complete-token' } as EngineState['current']
  return state
}
function configWith(state: EngineState, update: (config: GameConfig) => void): GameConfig {
  const config = structuredClone(state.config)
  update(config)
  return config
}

test('upcoming config only changes the current prepared round-one game and reveal multiplier', () => {
  const state = prepared('cave')
  const requested = configWith(state, (config) => {
    config.cave.maxTicks = 12
    config.revealPotMultiplier = 1.5
  })

  const events = applyUpcomingConfig(state, requested)

  assert.equal(state.config.cave.maxTicks, 12)
  assert.equal(state.config.revealPotMultiplier, 1.5)
  assert.equal(state.config.initialBalance, DEFAULT_CONFIG.initialBalance)
  assert.equal(events[0]?.type, 'config.updated')
  assert.deepEqual(events[0]?.data, {
    game: 'cave', section: 'cave', settings: state.config.cave, revealPotMultiplier: 1.5,
  })
})

test('upcoming config accepts only the next game at a completed round-three boundary', () => {
  const state = completeRoundThree(prepared(), 'bonus')
  const requested = configWith(state, (config) => { config.highLow.stars = 5 })

  applyUpcomingConfig(state, requested)

  assert.equal(state.config.highLow.stars, 5)
  assert.equal(state.config.bonus.stars, DEFAULT_CONFIG.bonus.stars)
  assert.throws(() => applyUpcomingConfig(state, configWith(state, (config) => { config.cave.stars = 7 })))
})

test('upcoming config rejects active rounds, non-boundary completions, finale completion, and initial-balance edits', () => {
  const active = prepared()
  active.current = { game: 'bonus', phase: 'choices', token: 'active', choices: {} }
  assert.throws(() => applyUpcomingConfig(active, structuredClone(DEFAULT_CONFIG)))

  const middleRound = prepared()
  middleRound.round = 2
  middleRound.current = { game: 'bonus', phase: 'complete', token: 'complete-token', choices: {} }
  assert.throws(() => applyUpcomingConfig(middleRound, structuredClone(DEFAULT_CONFIG)))

  const finale = completeRoundThree(prepared('bomb'), 'bomb')
  assert.throws(() => applyUpcomingConfig(finale, structuredClone(DEFAULT_CONFIG)))

  const initialBalanceEdit = prepared()
  const changedBalance = configWith(initialBalanceEdit, (config) => { config.initialBalance = 10 })
  assert.throws(() => applyUpcomingConfig(initialBalanceEdit, changedBalance), /Starting balance is locked/)
})

test('account adjustment sets absolute values in finished/reveal state and audits the before/after values', () => {
  const state = prepared()
  state.teams[0]!.balance = '12345'
  state.teams[0]!.stars = 2
  state.status = 'finished'
  state.reveal = { id: 'reveal', rankings: [{ teamId: 'amber', rank: 1 }], acknowledged: [] }
  const checkpointBefore = structuredClone(state.gameStart)

  const events = adjustTeamAccount(state, { teamId: 'amber', balance: '900.07', stars: 4, reason: 'Host correction' })

  assert.deepEqual(state.teams[0], { ...teams[0], balance: '90007', stars: 4 })
  assert.deepEqual(state.gameStart, checkpointBefore)
  assert.equal(events[0]?.type, 'team.account_adjusted')
  assert.deepEqual(events[0]?.data, {
    teamId: 'amber', game: 'bonus', round: 1, status: 'finished',
    before: { balance: '12345', stars: 2 }, after: { balance: '90007', stars: 4 }, reason: 'Host correction',
  })
})

test('account adjustment rejects unknown teams, excess decimal places, negative balances, and unsafe stars', () => {
  const state = prepared()
  assert.throws(() => adjustTeamAccount(state, { teamId: 'missing', balance: '1.00', stars: 0 }))
  assert.throws(() => adjustTeamAccount(state, { teamId: 'amber', balance: '1.001', stars: 0 }))
  assert.throws(() => adjustTeamAccount(state, { teamId: 'amber', balance: '-1', stars: 0 }))
  adjustTeamAccount(state, { teamId: 'amber', balance: '1000000000001.23', stars: 0 })
  assert.equal(state.teams[0].balance, '100000000000123')
  assert.throws(() => adjustTeamAccount(state, { teamId: 'amber', balance: '1', stars: Number.MAX_SAFE_INTEGER + 1 }))
})

test('stored JSON object order does not prevent a valid game-scoped config edit', () => {
  const state = prepared()
  state.config.cave = Object.fromEntries(Object.entries(state.config.cave).reverse()) as GameConfig['cave']
  const requested = configWith(state, config => { config.bonus.multiplier[0] = 4 })
  applyUpcomingConfig(state, requested)
  assert.equal(state.config.bonus.multiplier[0], 4)
})
