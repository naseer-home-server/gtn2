import { awardStars, cents, chooseWinner, ensure, finishRound, moneyAdd, moneyCompare, moneyMultiply, moneyMultiplyMany, safeMoney, teamById } from './helpers.js'
import type { EngineEnv, EngineEvent, EngineState, GameAction } from './types.js'
import { GameRuleError } from './errors.js'

const roundIndex = (state: EngineState) => {
  ensure(Number.isInteger(state.round) && state.round >= 1 && state.round <= 3, 'Round must be between 1 and 3.')
  return state.round - 1
}

function requirePhase(state: EngineState, game: 'bonus' | 'high-low' | 'cave', phase: string) {
  ensure(state.current.game === game && state.current.phase === phase, `The ${game} game is not accepting this action.`)
}

function resolveBonus(state: EngineState, events: EngineEvent[]) {
  const current = state.current
  ensure(current.phase !== 'ready' && current.game === 'bonus', 'Bonus round is not active.')
  const choices = current.choices
  const zeroTakers = Math.max(1, state.teams.filter((team) => choices[team.id] === '0').length)
  const totalTaken = safeMoney(moneyAdd(...Object.values(choices)))
  const i = roundIndex(state)
  const thresholdBonus = moneyCompare(totalTaken, cents(state.config.bonus.threshold[i])) <= 0 ? state.config.bonus.multiplier[i] : 1
  ensure(Number.isFinite(thresholdBonus) && thresholdBonus >= 0, 'Bonus multiplier must be nonnegative and finite.')
  const payouts: Record<string, string> = {}
  for (const team of state.teams) payouts[team.id] = moneyMultiplyMany(choices[team.id] ?? '0', thresholdBonus, zeroTakers)
  events.push({ type: 'bonus.resolved', data: { choices: { ...choices }, totalTaken, zeroTakers, thresholdBonus, payouts } })
  if (state.round === 3 && state.teams.length > 0) awardStars(state, chooseWinner(state, payouts), state.config.bonus.stars, events)
  finishRound(state, payouts, { choices: { ...choices }, totalTaken, zeroTakers, thresholdBonus }, events)
}

function resolveHighLow(state: EngineState, events: EngineEvent[]) {
  const current = state.current
  ensure(current.phase !== 'ready' && current.game === 'high-low', 'High-or-low round is not active.')
  const choices = current.choices
  const amounts = state.teams.map((team) => choices[team.id])
  const lowest = [...amounts].sort(moneyCompare)[0]
  const highest = [...amounts].sort((a, b) => moneyCompare(b, a))[0]
  const winner = [...state.teams].filter((team) => moneyCompare(choices[team.id], lowest) === 0).sort((a, b) => a.tieOrder - b.tieOrder)[0].id
  const payouts: Record<string, string> = {}
  for (const team of state.teams) payouts[team.id] = team.id === winner ? highest : lowest
  events.push({ type: 'high-low.resolved', data: { choices: { ...choices }, lowest, highest, winner, payouts } })
  if (state.round === 3) awardStars(state, winner, state.config.highLow.stars, events)
  finishRound(state, payouts, { choices: { ...choices }, lowest, highest, winner }, events)
}

function finishCave(state: EngineState, events: EngineEvent[], reason: 'collapsed' | 'everyone-left') {
  const current = state.current
  ensure(current.phase !== 'ready' && current.game === 'cave', 'Cave round is not active.')
  const payouts = Object.fromEntries(state.teams.map((team) => [team.id, current.banked[team.id] ?? '0']))
  events.push({ type: 'cave.ended', data: { reason, tick: current.tick, payouts, banked: { ...current.banked }, collapsed: current.collapsed } })
  if (state.round === 3 && state.teams.length > 0) awardStars(state, chooseWinner(state, state.caveTotals), state.config.cave.stars, events)
  finishRound(state, payouts, { reason, tick: current.tick, banked: { ...current.banked }, collapsed: current.collapsed }, events, false)
  current.stage = 'ended'
  current.nextTickAt = null
}

export function startEarlyGame(state: EngineState, env: EngineEnv): EngineEvent[] {
  const i = roundIndex(state)
  const game = state.current.game
  const token = env.token()
  if (game === 'bonus') {
    state.current = { game, token, phase: 'choices', choices: {} }
    return [{ type: 'bonus.started', data: { round: state.round, token } }]
  }
  if (game === 'high-low') {
    state.current = { game, token, phase: 'choices', choices: {} }
    return [{ type: 'high-low.started', data: { round: state.round, token } }]
  }
  ensure(game === 'cave', 'Current game is not an early game.')
  const inside = state.teams.map((team) => team.id)
  const starting = cents(state.config.cave.startingMoney[i])
  state.current = {
    game, token, phase: 'cave', tick: 1, stage: 'decisions', nextTickAt: env.now + state.config.cave.tickSeconds * 1000,
    inside, unbanked: starting, decisions: {}, banked: Object.fromEntries(state.teams.map((team) => [team.id, '0'])), collapsed: false,
  }
  return [{ type: 'cave.started', data: { round: state.round, token, starting, nextTickAt: state.current.nextTickAt } }]
}

export function actEarlyGame(state: EngineState, teamId: string, action: GameAction, _env: EngineEnv): EngineEvent[] {
  ensure(state.current.phase !== 'ready', 'The host has not started this round.')
  const team = teamById(state, teamId)
  if (action.type === 'bonus.take') {
    requirePhase(state, 'bonus', 'choices')
    const current = state.current
    ensure(current.game === 'bonus', 'Bonus round is not active.')
    ensure(current.choices[teamId] === undefined, 'This team has already chosen.')
    const amount = cents(action.amount)
    const maximum = cents(state.config.bonus.bag[roundIndex(state)])
    ensure(moneyCompare(amount, maximum) <= 0, 'Choice exceeds the bonus bag.')
    current.choices[teamId] = amount
    const events: EngineEvent[] = [{ type: 'bonus.choice', data: { teamId, amount } }]
    if (state.teams.every((item) => current.choices[item.id] !== undefined)) resolveBonus(state, events)
    return events
  }
  if (action.type === 'high-low.choose') {
    requirePhase(state, 'high-low', 'choices')
    const current = state.current
    ensure(current.game === 'high-low', 'High-or-low round is not active.')
    ensure(current.choices[teamId] === undefined, 'This team has already chosen.')
    const amount = cents(action.amount)
    const maximum = moneyMultiply(cents(state.config.highLow.pool[roundIndex(state)]), state.config.highLow.multiplier[roundIndex(state)])
    ensure(moneyCompare(amount, maximum) <= 0, 'Choice exceeds the high-or-low limit.')
    current.choices[teamId] = amount
    const events: EngineEvent[] = [{ type: 'high-low.choice', data: { teamId, amount } }]
    if (state.teams.every((item) => current.choices[item.id] !== undefined)) resolveHighLow(state, events)
    return events
  }
  if (action.type === 'cave.decide') {
    requirePhase(state, 'cave', 'cave')
    const current = state.current
    ensure(current.game === 'cave' && current.stage === 'decisions', 'The cave is not accepting decisions.')
    ensure(current.inside.includes(teamId), 'This team is no longer in the cave.')
    ensure(current.decisions[teamId] === undefined, 'This team has already decided for this tick.')
    ensure(action.decision === 'stay' || action.decision === 'leave', 'Invalid cave decision.')
    current.decisions[teamId] = action.decision
    const events: EngineEvent[] = [{ type: 'cave.decision', data: { teamId, decision: action.decision, tick: current.tick } }]
    if (action.decision === 'leave') {
      const banked = safeMoney(moneyAdd(current.banked[teamId] ?? '0', current.unbanked))
      team.balance = safeMoney(moneyAdd(team.balance, current.unbanked))
      current.banked[teamId] = banked
      state.caveTotals[teamId] = safeMoney(moneyAdd(state.caveTotals[teamId] ?? '0', current.unbanked))
      current.inside = current.inside.filter((id) => id !== teamId)
      events.push({ type: 'cave.earnings', data: { teamId, amount: current.unbanked, banked, balance: team.balance, tick: current.tick } })
      if (current.inside.length === 0) finishCave(state, events, 'everyone-left')
    }
    return events
  }
  throw new GameRuleError('Action does not belong to an early game.')
}

export function tickCave(state: EngineState, env: EngineEnv): EngineEvent[] {
  if (state.reveal) return []
  ensure(state.current.game === 'cave' && state.current.phase === 'cave', 'Cave round is not active.')
  const current = state.current
  ensure(current.phase === 'cave' && current.game === 'cave', 'Cave round is not active.')
  if (current.stage === 'ended' || current.nextTickAt === null || env.now < current.nextTickAt) return []
  // A safe opening decision window lets teams bank their starting money before the first risk check.
  const nextTick = current.tick + 1
  const departed = state.teams.length - current.inside.length
  const risk = state.config.cave.collapseRisk[Math.min(departed, 4)]
  ensure(Number.isFinite(risk) && risk >= 0 && risk <= 100, 'Cave collapse risk must be between 0 and 100.')
  const roll = env.random()
  ensure(Number.isFinite(roll) && roll >= 0 && roll < 1, 'Random source must return a value from 0 (inclusive) to 1 (exclusive).')
  const events: EngineEvent[] = current.stage === 'decisions' ? current.inside.filter((teamId) => current.decisions[teamId] === undefined)
    .map((teamId) => ({ type: 'cave.default_stay', data: { teamId, tick: current.tick } })) : []
  if (roll < risk / 100) {
    current.tick = nextTick
    current.collapsed = true
    current.stage = 'ended'
    events.push({ type: 'cave.collapsed', data: { tick: nextTick, departed, risk, roll } })
    finishCave(state, events, 'collapsed')
    return events
  }
  const growth = state.config.cave.growth[roundIndex(state)]
  ensure(Number.isFinite(growth) && growth >= 0, 'Cave growth multiplier must be nonnegative and finite.')
  current.unbanked = moneyMultiply(current.unbanked, growth)
  current.tick = nextTick
  current.stage = 'decisions'
  current.decisions = {}
  current.token = env.token()
  current.nextTickAt = env.now + state.config.cave.tickSeconds * 1000
  events.push({ type: 'cave.survived', data: { tick: current.tick, unbanked: current.unbanked, token: current.token, nextTickAt: current.nextTickAt, risk, roll } })
  return events
}
