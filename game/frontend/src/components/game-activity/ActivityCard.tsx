import { ArrowLeftRight, Check, Coins, DoorOpen, Eye, Mountain, PiggyBank, RotateCcw, Star, Trophy } from 'lucide-react'
import type { GameId } from 'backend/game'
import { gameNames, moneyCents, type GameActivity, type ReviewTeam } from './model'
import './style.css'

export function GameContext({ game, round }: { game?: GameId; round?: number }) {
  return <span className="activity-context"><span>{game ? gameNames[game] : 'Game'}</span><b>Round {round ?? '—'}</b></span>
}

export function ActivityCard({ activity, teams }: { activity: GameActivity; teams: ReviewTeam[] }) {
  const icons = { choice: Check, outcome: Trophy, pot: PiggyBank, transfer: ArrowLeftRight, stars: Star, cave: Mountain, reveal: Eye, reset: RotateCcw }
  const Icon = activity.title === 'Leave & bank' ? DoorOpen : icons[activity.kind]
  const team = teams.find(item => item.id === activity.teamId)
  return <article className="game-activity" data-kind={activity.kind}>
    <div className="activity-heading">
      <span className="activity-icon"><Icon size={17} aria-hidden="true" /></span>
      <div className="activity-title"><strong>{team?.name || activity.title}</strong>{team && <span>{activity.title}</span>}</div>
      <GameContext game={activity.game} round={activity.round} />
      {activity.time && <time className="activity-time" dateTime={activity.time}>{new Date(activity.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>}
    </div>
    {activity.metrics.length > 0 && <div className="activity-metrics">{activity.metrics.map((metric, index) => <div key={`${metric.label}-${index}`} className="activity-metric" data-tone={metric.tone} data-team={metric.teamId ? 'true' : undefined}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.detail && <small>{metric.detail}</small>}</div>)}</div>}
    {activity.progress !== undefined && <div className="activity-pot-progress" role="progressbar" aria-label={activity.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(activity.progress * 100)}><span style={{ width: `${activity.progress * 100}%` }} /></div>}
    {activity.note && <p className="activity-note">{activity.note}</p>}
  </article>
}

export function TeamAccounts({ teams, finished = false }: { teams: ReviewTeam[]; finished?: boolean }) {
  return <section className="game-accounts paper-panel" aria-label={finished ? 'Final team accounts' : 'Team accounts'}>
    <div className="accounts-heading"><Coins size={16} aria-hidden="true" /><strong>{finished ? 'Final team accounts' : 'Team accounts'}</strong><span>{finished ? 'Final balances' : 'Current balances'}</span></div>
    <div className="accounts-grid">{teams.length ? teams.map((team, index) => <article className="team-account" key={team.id}>
      <div className="account-name"><span className={`account-avatar account-color-${index % 5}`}>{team.rank ? `#${team.rank}` : team.name.slice(0, 1)}</span><strong>{team.name}</strong><span className="account-stars"><Star size={12} aria-hidden="true" />{team.stars ?? '—'}</span></div>
      <strong className="account-balance">{moneyCents(team.balance)}</strong>
    </article>) : <p className="activity-note">Accounts appear when teams are assigned.</p>}</div>
  </section>
}
