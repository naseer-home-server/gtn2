import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { DEFAULT_CONFIG, gameActionSchema, gameConfigSchema } from './config.js'
import { advanceEngine, applyAction, playerView, startEngine, startRoundEngine, tickEngine } from './index.js'
import { startFinalGame } from './final-games.js'
import type { EngineEnv, GameAction, Team } from './types.js'

const teams = (count: number): Team[] => Array.from({ length: count }, (_, i) => ({ id: randomUUID(), name: `Team ${i + 1}`, playerIds: [`player-${i}`], tieOrder: i, balance: '0', stars: 0 }))
const env: EngineEnv = { now: 0, random: () => 0.99, token: randomUUID }

for (const count of [6, 7]) test(`${count} teams complete all fifteen rounds with all-team barriers and private views`, () => {
  const config = structuredClone(DEFAULT_CONFIG)
  config.cave.collapseRisk = [0, 0, 0, 0, 0, 0, 0]
  config.cave.maxTicks = 2
  const { state } = startEngine(teams(count), config, env)
  for (let completed = 0; completed < 15; completed++) {
    startRoundEngine(state, env)
    const game = state.current.game
    const submitAll = (action: (index: number) => GameAction) => {
      const token = state.current.token
      for (const [index, team] of state.teams.entries()) {
        applyAction(state, team.id, token, action(index), env)
        if (index < count - 1) assert.notEqual(state.current.phase, 'complete')
      }
    }
    if (game === 'bonus') submitAll(index => ({ type: 'bonus.take', amount: index ? 0 : 100 }))
    if (game === 'high-low') submitAll(index => ({ type: 'high-low.choose', amount: index + 1 }))
    if (game === 'cave') {
      tickEngine(state, { ...env, now: 10_000 })
      tickEngine(state, { ...env, now: 20_000 })
      assert.equal(state.history.at(-1)?.details.reason, 'tick-limit')
      assert.equal(state.history.at(-1)?.details.collapsed, false)
    }
    if (game === 'circle') {
      submitAll(() => ({ type: 'circle.send', money: 0, stars: 0 }))
      assert.equal(state.current.phase, 'return')
      submitAll(() => ({ type: 'circle.return', money: 0, stars: 0 }))
    }
    if (game === 'bomb') submitAll(() => ({ type: 'bomb.allocate', up: 1, down: 0, recipients: { [state.teams.at(-1)!.id]: 1 } }))
    assert.equal(state.current.phase, 'complete')
    assert.equal(Object.keys(state.history.at(-1)!.payouts).length, count)
    const view = playerView('session', 'Large roster', state, 'player-0')
    assert.equal(view.teams.length, count)
    assert.ok(view.teams.every(team => !('balance' in team)))
    advanceEngine(state, env, true)
  }
  assert.equal(state.status, 'finished')
  assert.equal(state.history.length, 15)
  assert.throws(() => startEngine(teams(8), config, env), /2 and 7/)
})

test('six and seven teams can draw every valid circle-size grouping with equal random intervals', () => {
  for (const [count, expected] of [[6, ['2+2+2', '2+4', '3+3', '6']], [7, ['2+2+3', '2+5', '3+4', '7']]] as const) {
    const shapes = new Map<string, number>()
    for (let draw = 0; draw < 400; draw++) {
      const { state } = startEngine(teams(count), structuredClone(DEFAULT_CONFIG), env, 'circle')
      let calls = 0
      const events = startFinalGame(state, { ...env, random: () => ++calls < count ? 0.5 : (draw + 0.5) / 400 })
      const groups = events.find(event => event.type === 'circle.started')!.data.circles as string[][]
      const shape = groups.map(group => group.length).sort((a, b) => a - b).join('+')
      assert.equal(new Set(groups.flat()).size, count)
      assert.equal(groups.flat().length, count)
      assert.ok(groups.every(group => group.length >= 2))
      shapes.set(shape, (shapes.get(shape) || 0) + 1)
    }
    assert.deepEqual([...shapes.keys()].sort(), expected)
    assert.ok([...shapes.values()].every(occurrences => occurrences === 100))
  }
})

test('seven teams can split money among all six opponents without leaking other receipts', () => {
  const { state } = startEngine(teams(7), structuredClone(DEFAULT_CONFIG), env)
  state.teams[0].balance = '100'
  const action = gameActionSchema.parse({ type: 'money.transfer', amount: '1.00', recipientTeamIds: state.teams.slice(1).map(team => team.id) })
  applyAction(state, state.teams[0].id, state.current.token, action, env)
  assert.deepEqual(state.teams.map(team => team.balance), ['0', '17', '17', '17', '17', '16', '16'])
  assert.equal(playerView('s', 'Seven', state, 'player-0').moneyTransfers.length, 6)
  assert.equal(playerView('s', 'Seven', state, 'player-1').moneyTransfers.length, 1)
  assert.equal(gameActionSchema.safeParse({ ...action, recipientTeamIds: teams(7).map(team => team.id) }).success, false)
})

test('a public reveal waits for all seven acknowledgments and each snapshot hides after acknowledgment', () => {
  const { state } = startEngine(teams(7), structuredClone(DEFAULT_CONFIG), env)
  state.teams.forEach(team => { team.balance = '10000' })
  applyAction(state, state.teams[0].id, state.current.token, { type: 'pot.contribute', scope: 'public', amount: 100 }, env)
  assert.equal(state.reveal?.rankings.length, 7)
  for (let i = 0; i < 6; i++) {
    applyAction(state, state.teams[i].id, state.current.token, { type: 'reveal.acknowledge' }, env)
    assert.equal(playerView('s', 'Seven', state, `player-${i}`).reveal, null)
    assert.ok(state.reveal)
    assert.throws(() => startRoundEngine(state, env), /acknowledge/)
  }
  assert.equal(playerView('s', 'Seven', state, 'player-6').reveal?.rankings.length, 7)
  applyAction(state, state.teams[6].id, state.current.token, { type: 'reveal.acknowledge' }, env)
  assert.equal(state.reveal, null)
  startRoundEngine(state, env)
  assert.equal(state.current.phase, 'choices')
})

test('cave uses configured departure risks through six departures; legacy tables retain their cap', () => {
  for (const departed of [0, 1, 2, 3, 4, 5, 6]) {
    const { state } = startEngine(teams(7), structuredClone(DEFAULT_CONFIG), env, 'cave')
    startRoundEngine(state, env)
    for (const team of state.teams.slice(0, departed)) applyAction(state, team.id, state.current.token, { type: 'cave.decide', decision: 'leave' }, env)
    const events = tickEngine(state, { ...env, now: 10_000 })
    const riskCheck = events.find(event => event.type === 'cave.survived' || event.type === 'cave.collapsed')!
    assert.equal(riskCheck.data.risk, DEFAULT_CONFIG.cave.collapseRisk[departed])
    assert.equal(riskCheck.type, env.random() < DEFAULT_CONFIG.cave.collapseRisk[departed] / 100 ? 'cave.collapsed' : 'cave.survived')
  }
  const legacy = structuredClone(DEFAULT_CONFIG)
  legacy.cave.collapseRisk = [5, 20, 40, 60, 80]
  assert.deepEqual(gameConfigSchema.parse(legacy).cave.collapseRisk, legacy.cave.collapseRisk)
  const { state } = startEngine(teams(7), legacy, env, 'cave')
  startRoundEngine(state, env)
  for (const team of state.teams.slice(0, 6)) applyAction(state, team.id, state.current.token, { type: 'cave.decide', decision: 'leave' }, env)
  const events = tickEngine(state, { ...env, now: 10_000 })
  assert.equal(events.find(event => event.type === 'cave.survived')!.data.risk, 80)
})
