import type { EngineEvent, EngineState, GameId, Team } from './types.js'
import { moneyAdd, moneyCompare, safeMoney } from './money.js'
import { GameRuleError } from './errors.js'
export { cents, units, safeMoney, moneyAdd, moneySub, moneyCompare, moneyMultiply, moneyDivide, moneyMin, moneyScale, moneyMultiplyMany } from './money.js'

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GameRuleError(message)
}
export function teamById(state: EngineState, id: string): Team {
  const team = state.teams.find((item) => item.id === id)
  ensure(team, 'Team is not in this session.')
  return team
}
export function integer(value: number, min = 0) { ensure(Number.isSafeInteger(value) && value >= min, 'Expected a valid whole number.'); return value }
export function chooseWinner(state: EngineState, values: Record<string, string | number>): string {
  return [...state.teams].sort((a, b) => moneyCompare(String(values[b.id] ?? 0), String(values[a.id] ?? 0)) || a.tieOrder - b.tieOrder)[0].id
}
export function awardStars(state: EngineState, teamId: string, count: number, events: EngineEvent[]) {
  integer(count)
  if (!count) return
  const team = teamById(state, teamId)
  team.stars = integer(team.stars + count)
  events.push({ type: 'stars.awarded', data: { teamId, count, game: state.current.game, round: state.round } })
}
export function finishRound(state: EngineState, payouts: Record<string, string>, details: Record<string, unknown>, events: EngineEvent[], credit = true) {
  ensure(state.current.phase !== 'complete', 'Round is already complete.')
  for (const team of state.teams) {
    const payout = payouts[team.id] ?? '0'
    if (credit) team.balance = safeMoney(moneyAdd(team.balance, safeMoney(payout)))
    else BigInt(payout)
  }
  state.current.phase = 'complete'
  state.history.push({ game: state.current.game as GameId, round: state.round, payouts, details })
  events.push({ type: 'round.completed', data: { game: state.current.game, round: state.round, payouts, ...details } })
}
