import type { GameConfig, PlayerGameView } from 'backend/game'

const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })
const numbered = (values: number[]) => values.map((n, index) => `round ${index + 1}: ${money(n)}`).join('; ')

export function globalRuleCard() {
  return [
    'Game Theory Night 2: five games, three rounds each. One model represents each team. Your goal is to finish first by final balance; negotiation, cooperation, competition, promises, and bluffs are allowed.',
    'Balances and earnings are private. Public team names and star totals are visible. Ties use the fixed order set by first arrival. Teams may transfer money and contribute to public or private rank reveal pots when the player view allows it. Private chat is a direct message to one other team; only sender and recipient see it.',
    'A filled public rank pot reveals a ranking snapshot to everyone and pauses play until all teams acknowledge. A filled private pot reveals only the paying team’s rank. Each snapshot disappears after acknowledgment. Star awards from the first four games are public; the most-starred team gains a finale advantage revealed when the finale begins.',
    'All game choices are submitted through the player view. Other teams’ private choices, balances, transfers, and hidden information are unavailable unless game rules reveal them.',
  ].join('\n\n')
}

export function gameRuleCard(game: string | null | undefined, round: number | null | undefined, config: GameConfig, view?: PlayerGameView) {
  const index = Math.max(0, Math.min(2, (round || 1) - 1))
  const live = view?.rules
  if (game === 'bonus') {
    const bag = Number(live?.bag ?? config.bonus.bag[index]), threshold = Number(live?.threshold ?? config.bonus.threshold[index]), multiplier = Number(live?.multiplier ?? config.bonus.multiplier[index])
    return `Will we get bonus this year · Round ${index + 1}. Choose 0 to ${money(bag)}. If the sum taken is at most ${money(threshold)}, each take is multiplied by ${multiplier}; otherwise that threshold multiplier is 1. Your amount is also multiplied by the number of zero-takers, minimum 1. Only your own earnings are shown. Round-three payout winner receives ${config.bonus.stars} star(s).`
  }
  if (game === 'high-low') {
    const pool = Number(live?.pool ?? config.highLow.pool[index]), multiplier = Number(live?.multiplier ?? config.highLow.multiplier[index])
    return `High or low · Round ${index + 1}. Choose 0 to ${money(pool * multiplier)}. The lowest choice earns the highest chosen amount; every other team earns the lowest chosen amount. Shared arrival order resolves a tie for lowest. Choices and other teams’ earnings stay hidden. Round-three winner receives ${config.highLow.stars} star(s).`
  }
  if (game === 'cave') {
    const starting = Number(live?.startingMoney ?? config.cave.startingMoney[index]), growth = Number(live?.growth ?? config.cave.growth[index])
    const risk = config.cave.collapseRisk.map((value) => `${money(value)}%`).join(' / ')
    return `Cave mining · Round ${index + 1}. Start with ${money(starting)} unbanked. The first decision window is safe: leave to bank it. When a later window expires, collapse risk for 0 / 1 / 2 / 3 / 4 teams already departed is ${risk}. If the cave survives, remaining unbanked money grows by ×${growth}; no response means stay. Leaving banks the current amount; collapse gives teams still inside zero for this round. Previously banked money is safe. You see only your current unbanked amount, not who left or how many remain. Across all three rounds, the team with the most cave money banked receives ${config.cave.stars} stars.`
  }
  if (game === 'circle') {
    const multiplier = Number(live?.multiplier ?? config.circle.multiplier[index])
    return `What goes around comes around · Round ${index + 1}. Teams are randomly assigned to hidden circles of at least two teams. Send any amount up to your balance and any number of stars up to your star balance to the next team; outgoing amounts are multiplied by ×${multiplier}. You may return money and stars up to your current balances to your sender; returns are not multiplied. Your sender and received amounts are visible, while your recipient and circle structure stay hidden. This game awards no new stars.`
  }
  if (game === 'bomb') {
    const factor = Number(live?.factor ?? config.bomb.factor[index])
    const advantage = view?.finaleAdvantage
    const extra = advantage ? ` The most-starred team (${view.teams.find((team) => team.id === advantage.teamId)?.name ?? 'the star leader'}) may allocate ${advantage.maxChitsPerPile} chits per pile; other teams may allocate ${advantage.standardMaxChits}.` : ''
    return `Gamble bomb · Round ${index + 1}. Each team allocates at least ${config.bomb.minChits} chits to each up/down pile (standard maximum ${config.bomb.maxChits} per pile) and allocates recipient chits across teams. One chit is drawn from each pile; the recipient’s balance is multiplied by ×${factor} for up or divided by ×${factor} for down. Recipients are public; direction and allocations are hidden. No stars are awarded.${extra}`
  }
  return ''
}

export function currentRuleCard(view: PlayerGameView, config: GameConfig) {
  return [globalRuleCard(), gameRuleCard(view.game, view.round, config, view)].filter(Boolean).join('\n\n')
}
