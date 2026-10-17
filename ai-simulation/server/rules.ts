import type { GameConfig, PlayerGameView } from 'backend/game'

const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })
const numbered = (values: number[]) => values.map((n, index) => `round ${index + 1}: ${money(n)}`).join('; ')

export const PLAYER_OBJECTIVE = "Act like a human team playing for real money: your team takes home its final balance after all rounds and transfers. Your primary objective is to maximize the money your team takes home. Teams are ranked by their final balances. Consider immediate gains, possible losses, trust, and the value of future cooperation when making decisions."
export const PRIZE_ELIGIBILITY_RULE = "People have played this same game series before, and their average earnings set a prize-eligibility threshold. Your final earnings must be strictly above that average to be eligible for any prize. The threshold amount is unknown to players until the game series is over. Do not assume or invent its value."

export function gameTheoryBriefing() {
  return [
    'This is a repeated game-theory night. Choices can shape whether other teams trust you in later rounds; cooperation may grow rewards, but it can also expose you to exploitation. Make decisions from your incentives and the evidence available to you.',
  ].join('\n\n')
}

export function globalRuleCard() {
  return [
    'Game Theory Night 2 has five games with three rounds each. Each model represents one team. Teams are ranked by final balance; ties use the fixed order based on first arrival.',
    PRIZE_ELIGIBILITY_RULE,
    'Balances, earnings, and transfers between other teams are private. Team names and star totals are public. You see receipts only for transfers you send or receive. A private message is visible only to its sender and recipient.',
    'A filled public reveal pot shows every team’s rank to everyone and pauses play until all teams acknowledge. A filled private pot shows only the contributing team’s rank. Reveals show ranks, not balances or exact earnings, and each snapshot disappears after acknowledgment.',
    'Stars from the first four games are public. The team with the most stars gets a significant advantage in the finale; its exact limit is revealed when that game begins.',
    'Current public and private reveal pot costs are shown in your player view. Costs stay fixed through all three rounds of the game.',
    'Use the current player view and rules card for game choices, available actions, and information visible to your team.',
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
    const maxTicks = Number(live?.maxTicks ?? config.cave.maxTicks ?? 10)
    const deadline = `At most ${maxTicks} decision windows are allowed per round, counting the safe opening window as tick 1. Tick ${maxTicks} is the final decision window. When it expires, every team still inside automatically banks its current unbanked money and the round ends, with no further collapse check, growth, or tick ${maxTicks + 1}. Earlier windows still risk collapse as described.`
    const position = view?.roundState?.tick === undefined ? '' : ` Current tick: ${view.roundState.tick} of ${maxTicks}.`
    const risks = Array.isArray(live?.collapseRisk) ? live.collapseRisk as number[] : config.cave.collapseRisk
    const departures = risks.map((_value, index) => index).join(' / ')
    const risk = risks.map((value) => `${money(value)}%`).join(' / ')
    const legacy = risks.length < 7 ? ' For any additional departures, the last listed risk applies.' : ''
    return `Cave mining · Round ${index + 1}. Start with ${money(starting)} unbanked. The first decision window is safe: leave to bank it. When a window expires before the final tick, collapse risk for ${departures} teams already departed is ${risk}.${legacy} If the cave survives, remaining unbanked money grows by ×${growth}; no response means stay. ${deadline}${position} Leaving banks the current amount; collapse gives teams still inside zero for this round. Previously banked money is safe. You see your current tick and unbanked amount, not who left or how many remain. Across all three rounds, the team with the most cave money banked receives ${config.cave.stars} stars.`
  }
  if (game === 'circle') {
    const multiplier = Number(live?.multiplier ?? config.circle.multiplier[index])
    return `What goes around comes around · Round ${index + 1}. Teams are randomly assigned to hidden circles of at least two teams. Each valid combination of circle sizes is equally likely. For six teams the possible sizes are 6, 4+2, 3+3, or 2+2+2; for seven teams they are 7, 5+2, 4+3, or 3+2+2. Send any amount up to your balance and any number of stars up to your star balance to the next team; outgoing amounts are multiplied by ×${multiplier}. You may return money and stars up to your current balances to your sender; returns are not multiplied. Your sender and received amounts are visible, while your recipient and circle structure stay hidden. This game awards no new stars.`
  }
  if (game === 'bomb') {
    const factor = Number(live?.factor ?? config.bomb.factor[index])
    const advantage = view?.finaleAdvantage
    const extra = advantage ? ` The most-starred team (${view.teams.find((team) => team.id === advantage.teamId)?.name ?? 'the star leader'}) may allocate ${advantage.maxChitsPerPile} chits per pile; other teams may allocate ${advantage.standardMaxChits}.` : ''
    const min = view?.roundState?.minChits ?? config.bomb.minChits
    const max = view?.roundState?.maxChits ?? config.bomb.maxChits
    const ownLimit = view ? ` Your own limit is ${min}–${max} TOTAL chits in each of the two piles.` : ''
    return `Gamble bomb · Round ${index + 1}. There are exactly TWO piles: (1) one direction pile containing up and down chits together, and (2) one recipient pile containing team chits. Each team submits ${config.bomb.minChits}–${config.bomb.maxChits} TOTAL chits per pile as standard. The team with the most stars may submit up to ${config.bomb.advantageChits} chits per pile; this is a significant finale advantage. The up and down counts are NOT separate piles: minChits <= up + down <= that team's per-pile maximum. Either up or down may be zero. Independently, minChits <= sum(recipients values) <= that team's per-pile maximum; the two pile totals need not match. Recipient keys must be team IDs from the player view, with nonnegative integer counts. For a standard maximum of ${config.bomb.maxChits}, up=${config.bomb.maxChits}, down=0 fits the direction limit; up=${config.bomb.maxChits}, down=${config.bomb.maxChits} exceeds it. One chit is drawn from each pile; the recipient’s balance is multiplied by ×${factor} for up or divided by ×${factor} for down. Recipients are public; direction and allocations are hidden. No stars are awarded.${extra}${ownLimit}`
  }
  return ''
}

export function currentRuleCard(view: PlayerGameView, config: GameConfig) {
  return [globalRuleCard(), gameRuleCard(view.game, view.round, config, view)].filter(Boolean).join('\n\n')
}
