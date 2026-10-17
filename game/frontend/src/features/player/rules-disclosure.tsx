import type { GameId } from 'backend/game'
import { ChevronDown, BookOpen } from 'lucide-react'

const gameInstructions: Record<GameId, string> = {
  bonus: 'Choose how much to take from the bag. If everyone’s total stays within the collective threshold, every take gets the threshold multiplier. Zero takers add a second multiplier, with a minimum of one.',
  'high-low': 'Choose an amount. The lowest team earns the highest chosen amount; every other team earns the lowest. Arrival order breaks ties.',
  cave: 'Leave to bank your current unbanked money, or stay for a chance to grow it. Collapse loses the money still inside. The first decision window is safe. No response means stay.',
  circle: 'Send money and stars to a hidden recipient. Outgoing amounts are multiplied. Then choose how much to return to your sender; returns are not multiplied.',
  bomb: 'Allocate one pile between up and down, and another between recipient teams. One chit is drawn from each pile. The recipient’s balance is multiplied or divided by the bomb factor. Each pile has its own total.',
}
export function RulesDisclosure({ game, rules }: { game: GameId; rules?: Record<string, unknown> }) {
  const value = (key: string) => String(rules?.[key] ?? '—')
  const rows: [string, string][] = []
  if (game === 'bonus') rows.push(['Bag amount', value('bag')], ['Collective threshold', value('threshold')], ['Threshold multiplier', `${value('multiplier')}×`], ['Round-three stars', value('roundThreeStars')])
  if (game === 'high-low') rows.push(['Base pool', value('pool')], ['Stake multiplier', `${value('multiplier')}×`], ['Round-three stars', value('roundThreeStars')])
  if (game === 'cave') rows.push(['Maximum ticks', String(rules?.maxTicks ?? 10)], ['Starting money', value('startingMoney')], ['Growth multiplier', `${value('growth')}×`], ['Tick interval', `${value('tickSeconds')} seconds`], ['Collapse risk by departures', Array.isArray(rules?.collapseRisk) ? rules.collapseRisk.map((risk, index) => `${index}: ${risk}%`).join(' · ') : '—'], ['Game stars', value('gameStars')])
  if (game === 'circle') rows.push(['Transfer multiplier', `${value('multiplier')}×`])
  if (game === 'bomb') rows.push(['Bomb factor', `${value('factor')}×`])
  return <details className="rules-disclosure"><summary><span><BookOpen className="size-4" aria-hidden="true" />Rules and round settings</span><ChevronDown className="size-4" aria-hidden="true" /></summary><div><p>{gameInstructions[game]}</p>{rules && <dl>{rows.map(([label, setting]) => <div key={label}><dt>{label}</dt><dd>{setting}</dd></div>)}</dl>}</div></details>
}
