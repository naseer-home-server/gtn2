import type { ComponentType } from 'react'
import { WelcomeSlide } from './welcome-slide'
import { GameTheorySlide } from './game-theory-slide'
import { RealLifeSlide } from './real-life-slide'
import { PlanSlide, TemptationSlide } from './plan-slide'
import { AiSimulationSlide, PrizesSlide, AwardEligibilitySlide } from './ai-prize-slides'

type PresentationSlide = {
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
]

export function presentationSlideIndex(id: string | null) {
  const index = presentationSlides.findIndex(slide => slide.id === id)
  return index < 0 ? 0 : index
}
