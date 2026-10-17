import { Eye, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlayerSession } from './player-context'

export function RevealInterruption() {
  const { view, submit, action, blockedByUncertainTransfer } = usePlayerSession()
  if (!view.reveal) return null
  const isPrivate = view.reveal.scope === 'self'
  const Icon = isPrivate ? LockKeyhole : Eye
  return <section className="reveal-surface" aria-labelledby="rank-reveal-heading" aria-live="polite">
    <div className="mb-2 flex items-center gap-2"><Icon className="size-5" aria-hidden="true" /><h2 id="rank-reveal-heading" className="section-heading">{isPrivate ? 'Your rank revealed' : 'Public ranks revealed'}</h2></div>
    <p className="text-sm text-muted-foreground">{isPrivate ? 'Only your team sees this rank.' : 'Play is paused while teams acknowledge.'} This snapshot hides after your team acknowledges.</p>
    <ul className="my-3">{view.reveal.rankings.map(item => <li key={item.teamId}><span className="min-w-0 break-words">{view.teams.find(team => team.id === item.teamId)?.name ?? 'Your team'}</span><strong className="whitespace-nowrap">Rank {item.rank}</strong></li>)}</ul>
    {view.allowedActions.includes('reveal.acknowledge') ? <Button className="w-full" disabled={action.isPending || blockedByUncertainTransfer} onClick={() => submit({ type: 'reveal.acknowledge' })}>{action.isPending ? 'Acknowledging…' : 'Acknowledge and hide'}</Button> : <p className="text-sm">Your team leader can acknowledge this reveal.</p>}
  </section>
}
