import type { PresentationState } from 'backend/presentation'
import { parseMoney } from '@/lib/game-display'
export type FinalStandings = NonNullable<PresentationState['finalStandings']>
export function finalStandingsSteps(count: number) {
  const teams = Math.max(1, Math.min(7, count))
  return [...Array.from({length:teams}, (_,i) => `Reveal rank ${teams - i}`), 'Reveal the AI average']
}
export function standingsScale(standings: FinalStandings) {
  const amounts = [...standings.entries.map(team => parseMoney(team.earnings) ?? 0n), parseMoney(standings.modelAverage) ?? 0n]
  const maximum = amounts.reduce((a,b) => a > b ? a : b, 1n)
  const domain = maximum * 115n / 100n || 1n
  return (value: string) => Number(((parseMoney(value) ?? 0n) * 10000n) / domain) / 100
}
