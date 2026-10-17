import { Check, Clock3, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { GAME_ORDER, formatMoney, gameNames } from '@/lib/game-display'
import { usePlayerSession } from '@/features/player/player-context'
import { DecisionPanel } from '@/features/player/game-panels'
import { RulesDisclosure } from '@/features/player/rules-disclosure'
import { PlayAccount } from '@/features/player/play-account'
import { GameMark } from '@/features/player/game-mark'

export function PlayerGame() {
  const { view } = usePlayerSession()
  const { team, roundState: round, game } = view
  if (!team) return <WaitingForTeam />
  if (view.status === 'finished') return <><PlayAccount /><div className="empty-state"><img src="/brand/poker-chips.svg" alt="" className="mix-blend-darken" /><h1 className="display-title">That’s a wrap.</h1><p className="my-5">Fifteen rounds. Every choice counted. Your final balance and earnings are in your wallet.</p><Button asChild><Link to="/wallet">Open your wallet</Link></Button></div></>
  const result = [...view.earnings].reverse().find(item => item.game === game && item.round === view.round)
  const phase = round?.phase
  const ready = phase === 'ready', complete = phase === 'complete'
  const gameIndex = game ? GAME_ORDER.indexOf(game) : -1
  return <>
    <div className="round-meta"><span>Game <strong>{gameIndex + 1}</strong> of 5</span><span className="round-indicator"><span className="round-dot" aria-hidden="true" />Round {view.round} <span className="text-muted-foreground">/ 3</span></span></div><div className="night-progress" aria-hidden="true">{GAME_ORDER.map((item,index) => <span key={item} className={index === gameIndex ? 'current' : index < gameIndex ? 'past' : ''} />)}</div>
    <header className="game-heading"><div className="game-title-row"><h1 className={`display-title${game === 'bonus' || game === 'circle' ? ' game-title-long' : ''}`}>{game ? gameNames[game] : 'Your next game'}</h1><GameMark game={game} /></div>
    <p>{ready ? 'The table is set. Your host will start this round.' : complete ? 'This round is complete. Your host will start the next one.' : game === 'bonus' ? 'How much will you take? Make your choice together.' : game === 'high-low' ? 'The lowest choice wins the highest amount.' : game === 'cave' ? 'Stay for more. Leave before it all comes down.' : game === 'circle' ? round?.phase === 'return' ? 'Choose what to return to your sender.' : 'Pass money and stars to a hidden recipient.' : 'Two piles decide whose fortune changes.'}</p></header>
    <PlayAccount />
    {ready && <div className="empty-state py-7"><img src="/brand/spinner.svg" alt="" /><p className="flex items-center justify-center gap-2 text-sm"><Clock3 className="size-4" aria-hidden="true" />Waiting for the host</p></div>}
    {!ready && <DecisionPanel />}
    {complete && <div className="task-panel"><div className="flex items-center gap-2 text-sm"><Check className="size-4" aria-hidden="true" />Round complete</div>{result && <><p className="mt-5 text-sm text-muted-foreground">Your round earnings</p><p className="money-value mt-2 text-4xl">{formatMoney(result.amount)}</p></>}<Link to="/wallet" className="mt-5 inline-block text-sm text-primary underline underline-offset-4">View your wallet</Link></div>}
    {!complete && round?.hasLeft && <div className="status-note"><ShieldCheck aria-hidden="true" /><div><strong>You’ve banked safely.</strong><p>You’ve left the cave. Wait here while the round continues.</p></div></div>}
    {!complete && round?.submitted && !round.hasLeft && <div className="status-note" role="status"><Check aria-hidden="true" /><div><strong>Your decision is in.</strong><p>{game === 'cave' ? 'Waiting for the next cave check.' : 'Waiting for the round to continue.'}</p></div></div>}
    {!view.isTeamLeader && <div className="status-note"><ShieldCheck aria-hidden="true" /><div><strong>Decide together.</strong><p>Your teammate arrived first and is your team leader. Only they can submit decisions and money actions. You can both use Chats.</p></div></div>}
    {view.isTeamLeader && !ready && !complete && !round?.submitted && !view.allowedActions.some(type => ['bonus.take','high-low.choose','cave.decide','circle.send','circle.return','bomb.allocate'].includes(type)) && !round?.hasLeft && !view.reveal && <p className="my-6 text-sm text-muted-foreground" role="status">Waiting for play to continue.</p>}
    {game && <RulesDisclosure key={`${game}-${view.round}`} game={game} rules={view.rules} />}
  </>
}
export function WaitingForTeam() {
  return <div className="empty-state"><img src="/brand/spinner.svg" alt="" /><h1 className="display-title">Your seat is waiting.</h1><p className="my-5">Your host will assign you to a team before play begins. You can still say hello in Chats.</p><Button variant="outline" asChild><Link to="/chats">Open chats</Link></Button></div>
}
