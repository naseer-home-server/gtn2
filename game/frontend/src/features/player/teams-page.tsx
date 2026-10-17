import { Star, ShieldCheck } from 'lucide-react'
import { usePlayerSession } from './player-context'
export function TeamsPage() {
  const { view } = usePlayerSession()
  return <><header className="page-intro"><h1 className="display-title">The teams</h1><p>Stars are public. Balances and ranks stay private.</p></header>
    <p className="roster-caption">Listed in fixed team order, not rank order.</p>
    {!view.teams.length && <div className="empty-state"><img src="/brand/poker-chips.svg" alt="" className="mix-blend-darken" /><p>Your host is putting the teams together.</p></div>}
    <section className="team-roster" aria-label="Teams">{view.teams.map(team => <div className={`team-row${team.id === view.team?.id ? ' own-team' : ''}`} key={team.id}><span className="team-monogram" aria-hidden="true">{team.name.slice(0,1)}</span><div className="team-name"><p className="font-medium">{team.name}</p>{team.id === view.team?.id && <p className="own-team-label">Your team</p>}</div><span className="star-total"><Star className="size-4" aria-hidden="true" />{team.stars}<span className="sr-only"> stars</span></span></div>)}</section>
    {view.team && <section className="team-role"><div className="role-heading"><ShieldCheck aria-hidden="true" /><h2>Your role</h2></div><p className="mt-3 text-sm text-muted-foreground">{view.isTeamLeader ? 'You arrived first in your team, so you’re the leader. Discuss choices together, then submit decisions and money actions from your phone.' : 'Your teammate arrived first, so they’re the team leader. Discuss choices together; their phone submits decisions and money actions. You can both use Chats.'}</p></section>}
    {view.finaleAdvantage && <section className="paper-panel mt-8"><h2 className="section-heading">The finale advantage</h2><p className="mt-3 text-sm">{view.teams.find(team => team.id === view.finaleAdvantage?.teamId)?.name ?? 'The most-starred team'} gets up to {view.finaleAdvantage.maxChitsPerPile} chits per pile. Other teams get {view.finaleAdvantage.standardMaxChits}.</p></section>}
  </>
}
