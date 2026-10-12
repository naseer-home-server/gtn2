import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceEngine, applyAction, startEngine, startRoundEngine, tickEngine } from './index.js'
import { DEFAULT_CONFIG } from './config.js'
import type { EngineEnv, EngineState, GameAction, Team } from './types.js'

function teams(): Team[] {
  return [
    { id: 'a', name: 'Arrival 1', playerIds: ['p1', 'p2'], tieOrder: 0, balance: '0', stars: 0 },
    { id: 'b', name: 'Arrival 2', playerIds: ['p3', 'p4'], tieOrder: 1, balance: '0', stars: 0 },
    { id: 'c', name: 'Arrival 3', playerIds: ['p5'], tieOrder: 2, balance: '0', stars: 0 },
  ]
}

function env(now = 1_000_000): EngineEnv {
  let token = 0
  return { now, random: () => 0.99, token: () => `play-${++token}` }
}

function act(state: EngineState, teamId: string, action: GameAction, e: EngineEnv) {
  return applyAction(state, teamId, current(state).token, action, e)
}

function current(state: EngineState) { return state.current }

function submitChoices(state: EngineState, actions: Record<string, GameAction>, e: EngineEnv) {
  const token = state.current.token
  for (const team of state.teams) applyAction(state, team.id, token, actions[team.id], e)
  assert.equal(current(state).phase, 'complete')
}

function advance(state: EngineState, e: EngineEnv) {
  assert.equal(current(state).phase, 'complete')
  advanceEngine(state, e)
}

test('complete deterministic 15-round playthrough covers stakes, cave banking, transfers, and finale advantage', () => {
  const e = env()
  const { state, events } = startEngine(teams(), structuredClone(DEFAULT_CONFIG), e)
  assert.equal(state.gameIndex, 0)
  assert.equal(current(state).game, 'bonus')
  assert.equal(events.at(-1)?.type, 'round.ready')
  assert.equal(current(state).phase, 'ready')
  assert.throws(() => act(state, 'a', { type: 'bonus.take', amount: 0 }, e), /not started/)
  startRoundEngine(state, e)
  assert.equal(state.current.game, 'bonus')

  // Bonus rounds: the one zero taker multiplies every positive choice.
  for (let round = 1; round <= 3; round++) {
    submitChoices(state, {
      a: { type: 'bonus.take', amount: 0 },
      b: { type: 'bonus.take', amount: 1 },
      c: { type: 'bonus.take', amount: 2 },
    }, e)
    const expectedC = ['0', '0', '0']
    expectedC[round - 1] = String([600, 1000, 2000][round - 1])
    assert.equal(state.history.at(-1)?.payouts.c, expectedC[round - 1])
    if (round < 3) advance(state, e)
  }
  assert.deepEqual(state.teams.map((team) => team.stars), [0, 0, 1])
  advance(state, e)
  assert.equal(current(state).game, 'high-low')

  // The lowest choice wins the highest choice; the tie order resolves the round-three star.
  for (let round = 1; round <= 3; round++) {
    submitChoices(state, {
      a: { type: 'high-low.choose', amount: 1 },
      b: { type: 'high-low.choose', amount: 2 },
      c: { type: 'high-low.choose', amount: 3 },
    }, e)
    assert.equal(state.history.at(-1)?.payouts.a, '300')
    assert.equal(state.history.at(-1)?.payouts.b, '100')
    if (round < 3) advance(state, e)
  }
  assert.deepEqual(state.teams.map((team) => team.stars), [2, 0, 1])
  advance(state, e)
  assert.equal(current(state).game, 'cave')

  // Each cave tick survives, grows once, and banks for every team when they leave.
  for (let round = 1; round <= 3; round++) {
    assert.equal(current(state).game, 'cave')
    const cave = current(state)
    assert.equal(cave.game, 'cave')
    if (cave.phase === 'ready' || cave.game !== 'cave') throw new Error('Expected active cave round')
    const tickTime = cave.nextTickAt!
    const tickEvents = tickEngine(state, { ...e, now: tickTime })
    assert.ok(tickEvents.some((event) => event.type === 'cave.survived'))
    const afterTick = current(state)
    assert.equal(afterTick.game, 'cave')
    if (afterTick.phase === 'ready' || afterTick.game !== 'cave') throw new Error('Expected active cave round')
    const unbanked = afterTick.unbanked
    const decisionsAt = afterTick.nextTickAt! - 1
    for (const team of state.teams) act(state, team.id, { type: 'cave.decide', decision: 'leave' }, { ...e, now: decisionsAt })
    assert.equal(current(state).phase, 'complete')
    assert.equal(state.history.at(-1)?.game, 'cave')
    for (const team of state.teams) assert.equal(state.history.at(-1)?.payouts[team.id], unbanked)
    if (round < 3) advance(state, e)
  }
  assert.deepEqual(state.teams.map((team) => team.stars), [5, 0, 1])
  advance(state, e)
  assert.equal(current(state).game, 'circle')

  for (let round = 1; round <= 3; round++) {
    const outgoingToken = current(state).token
    for (const team of state.teams) {
      applyAction(state, team.id, outgoingToken, { type: 'circle.send', money: 1, stars: 0 }, e)
    }
    assert.equal(current(state).phase, 'return')
    assert.notEqual(current(state).token, outgoingToken)
    const returnToken = current(state).token
    for (const team of state.teams) {
      applyAction(state, team.id, returnToken, { type: 'circle.return', money: '0.50', stars: 0 }, e)
    }
    assert.equal(current(state).phase, 'complete')
    assert.equal(state.history.at(-1)?.game, 'circle')
    if (round < 3) advance(state, e)
  }
  assert.deepEqual(state.teams.map((team) => team.stars), [5, 0, 1])
  const finaleStartEvents = advanceEngine(state, e)
  assert.equal(current(state).game, 'bomb')
  assert.equal(state.advantagedTeamId, 'a')
  const advantageEvent = finaleStartEvents.find((event) => event.type === 'bomb.advantage_revealed')
  assert.equal(advantageEvent?.data.maxChitsPerPile, 60)

  for (let round = 1; round <= 3; round++) {
    const token = current(state).token
    assert.throws(() => applyAction(state, 'a', token, { type: 'bomb.allocate', up: 61, down: 0, recipients: { b: 1 } }, e), /Total chits/)
    const direction = round === 2 ? 'down' : 'up'
    const recipient = round === 1 ? 'b' : round === 2 ? 'c' : 'a'
    const finalEvents = []
    for (const team of state.teams) {
      const count = team.id === 'a' ? 60 : 1
      const action: GameAction = {
        type: 'bomb.allocate', up: direction === 'up' ? count : 0, down: direction === 'down' ? count : 0,
        recipients: { [recipient]: count },
      }
      finalEvents.push(...applyAction(state, team.id, token, action, e))
    }
    assert.equal(current(state).phase, 'complete')
    const completedBomb = current(state)
    assert.equal(completedBomb.game, 'bomb')
    if (completedBomb.phase === 'ready' || completedBomb.game !== 'bomb') throw new Error('Expected active bomb round')
    assert.equal(completedBomb.direction, direction)
    assert.equal(completedBomb.recipient, recipient)
    assert.ok(finalEvents.some((event) => event.type === 'bomb.resolved'))
    assert.equal(state.teams.reduce((sum, team) => sum + team.stars, 0), 6)
    if (round < 3) advance(state, e)
  }

  advance(state, e)
  assert.equal(state.status, 'finished')
  assert.equal(state.history.length, 15)
  assert.equal(state.history.filter((item) => item.game === 'bonus').length, 3)
  assert.equal(state.history.filter((item) => item.game === 'high-low').length, 3)
  assert.equal(state.history.filter((item) => item.game === 'cave').length, 3)
  assert.equal(state.history.filter((item) => item.game === 'circle').length, 3)
  assert.equal(state.history.filter((item) => item.game === 'bomb').length, 3)
  assert.deepEqual(state.teams.map((team) => team.balance), ['164000', '35200', '3880'])
})

test('orchestrator rejects invalid starts, early advances, stale tokens, and wrong game actions', () => {
  assert.throws(() => startEngine(teams().slice(0, 1), structuredClone(DEFAULT_CONFIG), env()), /two and five/)
  const { state } = startEngine(teams(), structuredClone(DEFAULT_CONFIG), env())
  assert.throws(() => advanceEngine(state, env()), /Finish this round/)
  assert.throws(() => applyAction(state, 'a', 'old-token', { type: 'bonus.take', amount: 0 }, env()), /earlier round or tick/)
  startRoundEngine(state, env())
  assert.throws(() => act(state, 'a', { type: 'high-low.choose', amount: 1 }, env()), /not accepting this action/)
})
