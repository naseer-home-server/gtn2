import type { GameConfig, PlayerGameView } from 'backend/game'

const money = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 })
const numbered = (values: number[]) => values.map((n, index) => `round ${index + 1}: ${money(n)}`).join('; ')

export function gameTheoryBriefing() {
  return [
    'Welcome to a repeated game-theory night: five games, three rounds each, with increasing rewards. Your team wants to finish first by final balance, but cooperation can create far more value than everyone acting selfishly. In cooperation-dependent situations, universal selfishness can leave everyone with small rewards, while a selfish minority can exploit a cooperative majority. Exact payoffs depend on each game’s rules; cooperation is not a guaranteed win.',
    'Repeated rounds let you build trust, keep or break promises, and change strategy. If teams identify someone who defects from an agreement, they can coordinate future play to punish that team or withdraw cooperation. Accusations and claims about earnings are not proof: each team’s choices, earnings, balance, and private transfers stay private. Stars also matter: the team with the most stars receives a significant advantage in the bomb finale.',
    'Reveal pots buy partial information, not a full audit. A private pot is usually cheaper and shows only your own rank. A public pot reveals everyone’s rank, costs more, and usually needs collaboration to fund. Neither reveals balances, exact earnings, or who broke an agreement; a rank snapshot becomes historical as play continues.',
    'Some collaborative strategies need money transfers to share proceeds or compensate teams that sacrifice direct earnings. Negotiate who pays whom, how much, and when. Saying you will pay does not transfer money: use the money.transfer action during a financial-action window. Promises are not enforced automatically, so keeping or breaking them is a strategic choice.',
    'There is one discussion between rounds in a newly shuffled speaking order: review previous private feedback and plan using the upcoming round rules. The first round also has an initial discussion. Each speaker can read earlier replies in that discussion. No game actions or financial actions are allowed during pre-round discussion. Once the host starts the round, game choices are collected independently. After the round, every team receives its own private feedback before the next between-round discussion. Financial-action windows after each discussion sweep let teams fulfil transfer promises and fund reveal pots before the next round starts. Action turns carry no chat. The finale has a closing discussion and settlement. Cave decision-window discussions use the same ordered conversation while the game clock is frozen.',
  ].join('\n\n')
}

export function globalRuleCard() {
  return [
    'Game Theory Night 2: five games, three rounds each. One model represents each team. Your goal is to finish first by final balance; negotiation, cooperation, competition, promises, and bluffs are allowed.',
    'Balances and earnings are private. Public team names and star totals are visible. Ties use the fixed order set by first arrival. Teams may transfer money and contribute to public or private rank reveal pots when the player view allows it. Private chat is a direct message to one other team; only sender and recipient see it.',
    'A filled public rank pot reveals a ranking snapshot to everyone and pauses play until all teams acknowledge. A filled private pot reveals only the paying team’s rank. Each snapshot disappears after acknowledgment. Star awards from the first four games are public; the most-starred team gains a significant finale advantage, with its exact bomb limit revealed when the finale begins.',
    'All game choices are submitted through the player view. Other teams’ private choices, balances, transfers, and hidden information are unavailable unless game rules reveal them.',
    'This is repeated game theory with increasing rewards: cooperation, defection, reputation, and retaliation may affect future rounds. Some cooperative plans require explicit money.transfer actions to redistribute earnings. A single discussion between rounds permits no actions: review your own private results and plan for the upcoming rules, then settle promises in separate financial windows before the host starts game choices. Action turns carry no chat. The finale has a closing discussion and settlement. Discussion speakers take turns in a shuffled order and see earlier replies; action proposals are collected independently.',
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
