import { FinalStandingsSlide } from './final-standings-slide'
import { finalStandingsSteps } from './final-standings-model'
import type { GameId } from 'backend/game'
import { ArrivalAdvantagesSlide, BriberySlide, RevealPotsSlide, TieOrderSlide, StarsSlide, HiddenStakesSlide } from './social-slides'
import { ConfiguredGameSlide, TeamFormationSlide, JoinGameSlide, DiscussionSlide, StartRoundSlide, StarTradingSlide } from './live-slides'
import { GameResultsDemoSlide } from './game-instruction-slides'
import { GAME_ORDER, gameNames } from '@/lib/game-display'
import type { ComponentType } from 'react'
import { WelcomeSlide } from './welcome-slide'
import { GameTheorySlide } from './game-theory-slide'
import { RealLifeSlide } from './real-life-slide'
import { PlanSlide, TemptationSlide } from './plan-slide'
import { AiSimulationSlide, PrizesSlide, AwardEligibilitySlide } from './ai-prize-slides'

export type PresentationSlide = {
  group?: string
  game?: GameId
  round?: number
  kind?: 'discussion' | 'start'

  id: string
  title: string
  Component: ComponentType<{ step: number }>
  steps: readonly string[]
  notes: string
  source?: string
}

export const presentationSlides: PresentationSlide[] = [
  { id: 'welcome', title: 'Welcome', Component: WelcomeSlide, steps: ['Welcome'], notes: 'Welcome everyone to Game Theory Night 2.' },
  {
    id: 'game-theory', title: 'Game theory', Component: GameTheorySlide, steps: ['The prisoners', 'The payoffs', 'The dilemma'],
    notes: 'Game theory studies games in which outcomes depend on the choices of multiple players. Here the two prisoners are separated. Each can stay silent or betray the other. The numbers are illustrative years in prison, lower is better, and the red number is yours. If both stay silent they get one year each. Betray a silent partner and you go free while they get ten years. If both betray they get five each. Betraying reduces your sentence whichever action the other prisoner takes: zero instead of one, or five instead of ten. So betrayal is a dominant strategy in this one-shot example, even though mutual silence is better for both than mutual betrayal. The outcome depends on both players; this example does not mean that your best action must always change with theirs. Repetition, communication, and trust can change the game.',
    source: 'https://sites.math.duke.edu/~rtd/sem2013/EGch.pdf',
  },
  {
    id: 'real-life', title: 'Games in real life', Component: RealLifeSlide, steps: ['Shared kitchen', 'Group project', 'Shared fishery'],
    notes: 'These are simplified social dilemmas with a shared benefit and an individual temptation to free-ride. Shared kitchen: when everyone cleans, everyone enjoys a clean space; one person can skip their share while others clean; if everyone skips, everyone lives with the mess. Group project: if everyone contributes, the group produces a strong result; if credit is shared without tracking individual effort, a free-rider gets the credit without doing the work; if everyone free-rides, there is no finished result. Shared fishery: if everyone limits harvesting to a sustainable level, the stock supports future catches; one fisher can take more while others exercise restraint; if everyone overharvests, the stock can be depleted and future catches fall. The middle column shows the short-term private temptation, and the last column shows the collective cost. The fishery example unfolds over time. These are illustrative situations, not claims that every kitchen, project, or fishery has identical payoffs. Repeated relationships, accountability, rules, and enforcement can change the incentives.',
  },
  {
    id: 'plan', title: 'Plan for today', Component: PlanSlide, steps: ['Five games', 'Teams of two'],
    notes: 'Tonight we will play five game-theory-based games in teams of two. Each team makes decisions together as one player. The theme is the temptation to betray: there will be opportunities to improve your own position at others’ expense, but if everyone follows that temptation, everyone can end up worse off than if they cooperated. Betrayal can reduce your own earnings while cutting everyone else’s by much more: the incentive is to get ahead of other teams, rather than increase your absolute winnings. The coin stacks illustrate that tension; they are not payout amounts or a claim that all five games share one identical payoff matrix. Explain each game’s actual rules when it comes up. If the attendance count is odd, the host can assign one solo team under the existing rules.',
  },
  {
    id: 'temptation', title: 'The temptation', Component: TemptationSlide,
    steps: ['All cooperate', 'One team betrays', 'All betray'],
    notes: 'Advance one outcome at a time. First, everyone cooperates and all teams do well. Next, one team betrays: its own winnings are lower than under cooperation, but everyone else’s winnings fall much further. The betrayer gains a relative lead despite earning less. The incentive is to finish ahead of the other teams, not to make a bigger absolute gain. Finally, everyone follows that temptation and all teams end up with less than under cooperation. These are conceptual coin stacks, not actual payouts or a promise that every game has an identical payoff matrix.',
  },
  {
    id: 'ai-simulations', title: 'One more thing', Component: AiSimulationSlide,
    steps: ['AI group chat'],
    notes: 'I ran multiple simulations of tonight’s games, letting seven AI agents compete against one another. Their earnings give us an AI benchmark for the human teams to beat. The static chat interface represents their discussions with empty bubbles and an earnings field for each agent. Earnings amounts are intentionally not shown; this is an illustration, not a live chat or fabricated simulation results. The benchmark is the average AI earnings from the simulations; no numeric value has been supplied for this deck yet.',
  },
  {
    id: 'prizes', title: 'The prizes', Component: PrizesSlide,
    steps: ['Silver: beat the AI average', 'Gold: highest team earnings'],
    notes: 'Every team whose earnings beat the average AI score receives the silver award labelled “Will not be replaced by AI”. The team with the highest earnings can win the gold award labelled “Most Devious”, subject to beating the AI average. The same team can qualify for silver and gold. Reveal the silver award first, then the gold award; the next slide makes the gold eligibility condition explicit. The displayed trophies are newly created assets based on the supplied photos, not the photos themselves.',
  },
  {
    id: 'eligibility', title: 'One important rule', Component: AwardEligibilitySlide,
    steps: ['Beat the AI average to qualify'],
    notes: 'To be eligible for Most Devious, a team must beat the average AI score. Merely finishing ahead of the other human teams is not enough. Matching the AI average is not beating it: the comparison is strictly greater than. If no human team beats the benchmark, no team is eligible for Most Devious. The prize winner is the highest-earning eligible team. No numeric AI benchmark has been provided yet, so the slide states the rule without inventing a score.',
  },
  { id: 'arrival-order', group: 'Before we play', title: 'Early arrival advantages', Component: ArrivalAdvantagesSlide, steps: ['Choose your partner first', 'Fixed tie order'], notes: 'The first unpaired arrival chooses a teammate, then the next unpaired arrival picks. Every tie uses the fixed team order determined by its earlier member’s arrival. That person is also the team leader, whose phone submits team decisions and transfers.' },
  { id: 'make-teams', group: 'Before we play', title: 'Make teams', Component: TeamFormationSlide, steps: ['Pick our teams'], notes: 'Use the private host controls to pick a partner for the earliest remaining arrival. Undo the last team to correct a pick. The TV shares the public draft; it contains names only. Confirm after all arrived players are paired, allowing the final player to be solo when attendance is odd. Confirmation saves the real teams and prepares Bonus round 1. Existing prepared teams are fixed and shown in tie order.' },
  { id: 'join', group: 'Before we play', title: 'Join the game', Component: JoinGameSlide, steps: ['Scan to join'], notes: 'Scan the QR code or open https://gtn.24071999.xyz. Sign in with the invited account. Both teammates may sign in, but the earlier arrival is the leader and submits decisions for the team.' },
  { id: 'bribery', group: 'Before we play', title: 'Bribes encouraged', Component: BriberySlide, steps: ['Make an offer', 'Wallet: Send money', 'Private, immediate transfers'], notes: 'Bribes are encouraged. Agree on a deal in person or in Chats, then the leader opens Wallet → Send money. Choose one or more recipient teams, a total and optionally edited shares, then confirm. Transfers are immediate; commitments are social, not enforced by the app. Transfer receipts and balances remain private.' },
  { id: 'reveal-pots', group: 'Before we play', title: 'Pay for a peek', Component: RevealPotsSlide, steps: ['Private self-rank', 'Public ranks', 'Prices change each game'], notes: 'Wallet → Rank reveals. Contributions spend real team money. The private pot shows only your own rank, without pausing others. The public pot shows all ranks and pauses play until every team acknowledges; each snapshot hides for that team after acknowledgment. Balances stay private. Prices change when a game starts and stay fixed for its three rounds. Each filled pot resets and may be funded again. Phone examples are fictional.' },
  { id: 'tie-order', group: 'Before we play', title: 'Find the tie order', Component: TieOrderSlide, steps: ['Find the order in Teams'], notes: 'Open Teams in the bottom navigation. The list is the fixed tie order, based on each team’s earlier arrival. It is not a balance leaderboard. Stars are public; balances and earnings are private.' },
  { id: 'stars', group: 'Before we play', title: 'Stars', Component: StarsSlide, steps: ['Earning, public totals, and trading'], notes: 'Teams can earn stars as well as money. Actual awards are explained with each game’s modifiers. Star totals are public and visible in Teams. Ordinary star trading opens after circle round 3, before finale round 1 starts; circle send/multiply/return mechanics remain a separate exception. The next slide explains that the nature of the most-starred team’s finale advantage stays hidden.' },
  { id: 'hidden-stakes', group: 'Before we play', title: 'Two things to keep in mind', Component: HiddenStakesSlide, steps: ['AI average and finale advantage'], notes: 'The average AI earnings will be announced only after every game ends. The AI average appears only in the last step of final standings. For stars, only the nature of the most-starred team’s finale advantage stays hidden until the finale. Earning stars, public totals and trading were explained on the previous slide. Ties in stars use arrival order.' },
  ...GAME_ORDER.flatMap((game, gameIndex): PresentationSlide[] => {
    const group = `Game ${gameIndex + 1}: ${gameNames[game]}`
    const slides: PresentationSlide[] = []
    if (game === 'bomb') slides.push({ id: 'star-trading', group, title: 'One last deal: trade stars', Component: StarTradingSlide, steps: ['Trade before the finale'], notes: 'Once circle round 3 is complete, leaders can open Wallet → Send stars. Agree on any payment and use Send money separately: this is not an atomic marketplace or enforced contract. Public star totals update live here. Starting finale round 1 closes trading and freezes the most-starred advantage. Do not start the finale until trades are finished.' })
    if (game === 'bonus') slides.push(
      { id: 'bonus-rules', group, game, title: 'Will we get a bonus this year?: take from the bag', Component: ({ step }) => <ConfiguredGameSlide game="bonus" kind="rules" step={step}/>, steps: ['Seven teams, one bag each'], notes: 'Each team independently takes between zero and the configured bag amount. The seven pairs and bags are an illustration, not live choices or balances. The next slide explains the two independent payout bonuses. Round-specific values and the star award appear later in modifiers.' },
      { id: 'bonus-bonuses', group, game, title: 'Bonus rules', Component: ({ step }) => <ConfiguredGameSlide game="bonus" kind="bonuses" step={step}/>, steps: ['The two bonus rules'], notes: 'The collective bonus applies when the combined amount taken by all teams is at most the threshold, including equality. It multiplies each team’s own take by the round multiplier; otherwise this factor is one. Independently, multiply by the number of teams that took exactly zero, using one if nobody did. The zero-taker bonus still applies even if the collective threshold was exceeded. Only your own payout is visible. These introductory values use round one of the active session configuration; all three rounds are shown in modifiers.' },
    )
    else if (game === 'high-low') slides.push(
      { id: 'high-low-rules', group, game, title: 'High or low: choose your amount', Component: ({ step }) => <ConfiguredGameSlide game="high-low" kind="rules" step={step}/>, steps: ['Seven teams choose an amount'], notes: 'Each team chooses zero to the active round-one base pool times its multiplier. The seven pairs and bags are illustrative. This is a choice, not a payment from the team’s balance. The next slide shows fictional choices and payouts.' },
      { id: 'high-low-example', group, game, title: 'High or low: an example', Component: ({ step }) => <ConfiguredGameSlide game="high-low" kind="example" step={step}/>, steps: ['Seven choices', 'Lowest and highest', 'The payouts'], notes: 'Reveal the fictional choices, then highlight Team 2 as lowest and Team 5 as highest. The selected lowest team earns the highest chosen amount; every other team earns the lowest chosen amount. A tied lowest has only one winner, selected by arrival order. Choices and other teams’ outcomes remain private during real play. Example amounts scale with the active configuration; star awards appear in modifiers.' },
    )
    else if (game === 'cave') slides.push(
      { id: 'cave-rules', group, game, title: 'Cave mining: deeper every tick', Component: ({ step }) => <ConfiguredGameSlide game="cave" kind="rules" step={step}/>, steps: ['Tick 1: the entrance', 'Tick 2: deeper', 'Tick 3: deeper again'], notes: 'The three rows are successive decision windows in round one, with fictional teams. Each tick lasts the configured duration. Tick one opens safely with the starting haul; money is still unbanked. After each non-final window, check collapse risk using departures so far; only if the cave survives does the haul multiply and the next tick open. Final tick auto-banks instead. Real player views hide other teams’ decisions and how many remain.' },
      { id: 'cave-decisions', group, game, title: 'Cave mining: stay or leave', Component: ({ step }) => <ConfiguredGameSlide game="cave" kind="cave-decisions" step={step}/>, steps: ['Choose each tick; leaving banks the current haul'], notes: 'Every team can leave during every decision window, including the safe first window. Leaving banks the current tick’s amount immediately and protects it from later collapse. Staying risks the unbanked haul for growth if the cave survives. No response means stay. At the configured final tick, remaining teams bank automatically without another collapse check or growth. The diagrams are fictional, not live team movements.' },
      { id: 'cave-collapse', group, game, title: 'Cave mining: collapse risk', Component: ({ step }) => <ConfiguredGameSlide game="cave" kind="cave-collapse" step={step}/>, steps: ['Collapse and the probability table'], notes: 'Collapse ends the round: teams still inside earn zero for this round; previously banked earnings and prior balance stay safe. Risk at each non-final tick boundary is selected from the active configuration by the number of teams already departed. Legacy five-entry tables cap at the last row. If all teams leave the round ends safely. The final tick auto-banks, with no collapse check. Actual departures and the number inside are private.' },
    )
    else if (game === 'bomb') slides.push(
      { id: 'bomb-rules', group, game, title: 'Gamble bomb: one of seven teams', Component: ({ step }) => <ConfiguredGameSlide game="bomb" kind="rules" step={step}/>, steps: ['One team receives the bomb'], notes: 'The animated bomb lands on fictional Team 4 among seven teams. Any team can receive it, including the team contributing the chits. The real recipient is public, but balances and the direction are private. The next slide explains the effect on the recipient’s whole accumulated money balance.' },
      { id: 'bomb-worth', group, game, title: 'Gamble bomb: the stakes', Component: () => <ConfiguredGameSlide game="bomb" kind="bomb-worth" step={0}/>, steps: ['Multiply or divide the whole balance'], notes: 'The fictional starting balance is 1,000. Use the active round-one factor to show both possible outcomes. Only the selected recipient’s entire current money balance is multiplied or divided, with cent rounding. Stars are not part of this balance. These examples are not real balances or actual outcomes, and equal-sized examples do not imply equal probabilities. Only the recipient learns up or down.' },
      { id: 'bomb-buckets', group, game, title: 'Gamble bomb: two chit buckets', Component: ({ step }) => <ConfiguredGameSlide game="bomb" kind="bomb-buckets" step={step}/>, steps: ['Add to both buckets', 'Draw one from each'], notes: 'Every team allocates to two independent shared buckets. Recipient chits name a team; direction chits say up or down. Draw one from each bucket, so more chits for an outcome increase its chance. Direction up+down share one per-team limit; recipient allocations have a separate limit, and totals need not match. Either direction can have zero chits, subject to the combined minimum. The most-starred team gets the configured larger limit in both buckets; ties use arrival order. Allocations and bucket totals stay private. The illustrative draw is Team 4 and up, not a live result.' },
    )
    else slides.push(
      { id: `${game}-rules`, group, game, title: `${gameNames[game]}: rules`, Component: ({ step }) => <ConfiguredGameSlide game={game} kind="rules" step={step} />, steps: ['The decision', 'The incentive', 'The consequences', 'What stays private'], notes: 'Advance the visual one step at a time. These instructions use the active session configuration, not a separate ruleset. Discuss the choices, timing, visibility and star award. The diagram is an illustration and never reveals live decisions, balances or the actual circle map.' },
    )
    slides.push(
      { id: `${game}-input`, group, game, title: `${gameNames[game]}: your phone`, Component: ({ step }) => <ConfiguredGameSlide game={game} kind="input" step={step} />, steps: game === 'circle' ? ['Send'] : game === 'bomb' ? ['Direction pile', 'Recipient pile'] : ['Try the player input'], notes: 'A safe local demo of the decision input. All teams, amounts and choices are illustrative; nothing is sent to the live game. Your leader submits the first accepted choice, which is final.' },
    )
    if (game === 'circle') slides.push(
      { id: 'circle-received', group, game, title: 'What goes around comes around: money received', Component: () => <ConfiguredGameSlide game="circle" kind="circle-received" step={0}/>, steps: ['Your sender and what arrived'], notes: 'After all teams send, the return phase reveals your sender and the money and stars received. These received amounts already include the round multiplier. This fictional example has Team 7 send 20 money and one star, multiplied by the active round-one configuration. Your outgoing recipient and the circle remain hidden. Nothing is sent to the live game.' },
      { id: 'circle-return', group, game, title: 'What goes around comes around: return to sender', Component: () => <ConfiguredGameSlide game="circle" kind="input" step={1}/>, steps: ['Return, unmultiplied'], notes: 'A local demo of returning money and stars to your now-known sender. Returns are not multiplied and can use the team’s current balances, not only the received amount. Nothing is sent to the live game.' },
    )
    if (game === 'bonus' || game === 'high-low') slides.push(
      { id: `${game}-results`, group, game, title: `${gameNames[game]}: what you see`, Component: () => <GameResultsDemoSlide game={game}/>, steps: ['Your private round earnings'], notes: 'After every team submits, Play shows Round complete and only this team’s round earnings. Wallet → Activity lists its past round earnings. The phone is a fictional static example, never live private data. Other teams’ choices and earnings stay hidden. Bonus additionally hides the combined take and bonus breakdown. Star totals remain public as explained earlier.' },
    )
    slides.push(
      { id: `${game}-modifiers`, group, game, title: `${gameNames[game]}: three rounds`, Component: ({ step }) => <ConfiguredGameSlide game={game} kind="modifiers" step={step} />, steps: ['Round settings and stars'], notes: 'Compare all three round settings from the active configuration. Stars are awarded by the configured rules: Bonus round-three highest payout, High or Low round-three lowest-choice winner, Cave most banked cumulatively. Circle multiplies existing stars but awards no new stars; the finale awards none. Every tie uses the fixed arrival order.' },
    )
    for (let round = 1; round <= 3; round++) slides.push(
      { id: `${game}-round-${round}-discussion`, group, game, round, kind: 'discussion', title: `Round ${round}: discuss`, Component: () => <DiscussionSlide game={game} round={round} />, steps: ['Ten-minute discussion'], notes: 'The ten-minute clock starts when this discussion first appears on the TV for this active session. Previewing it alone does not start it; use Resume timer to start from the host desk. Pause, resume or reset from the private host controls. It survives refresh and stays synchronized across same-browser tabs. Zero only ends discussion; it never starts or submits gameplay. Finish the preceding round before starting this one.' },
      { id: `${game}-round-${round}-start`, group, game, round, kind: 'start', title: `Round ${round}: play`, Component: () => <StartRoundSlide game={game} round={round} />, steps: ['Start the round'], notes: 'Use Start round on the private host desk. The button is enabled only for this exact upcoming round, and is blocked during public rank reveals. A revision check prevents a stale start from advancing a different round. Wait for all team actions; cave timing is managed by the game server. Move on to the next discussion when complete. After the last finale round, finish game night here, then continue to final standings to reveal teams from last place to first, followed by the AI benchmark.' },
    )
    return slides
  }),
  { id: 'final-standings', group: 'The results', title: 'Final standings', Component: FinalStandingsSlide, steps: finalStandingsSteps(7), notes: 'Finish game night on the finale round-three play slide or with the control below. Final standings use final money balances, including transfers, reveal spending and finale effects; they are not the sum of gross round payouts. Arrival order breaks ties. Advance to reveal one team at a time, starting with last place. After first place, advance once more for the model average line. The host and TV use the same reveal position; going back hides later reveals. Values are fetched only on this slide after game night is finished.' },

]

export function presentationSlideIndex(id: string | null) {
  const index = presentationSlides.findIndex(slide => slide.id === id)
  return index < 0 ? 0 : index
}
