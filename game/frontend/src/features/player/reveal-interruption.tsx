import { useEffect, useRef, useState } from 'react'
import { Eye, LockKeyhole, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { usePlayerSession } from './player-context'

export function RevealInterruption() {
  const { view, submit, retry, action, blockedByUncertainTransfer } = usePlayerSession()
  const [publicOpen, setPublicOpen] = useState(false)
  const [privateExpanded, setPrivateExpanded] = useState(true)
  const handledRevealId = useRef<string | null>(null)
  const reveal = view.reveal
  const isPublic = reveal?.scope === 'public'
  const revealId = reveal?.id
  const revealScope = reveal?.scope

  useEffect(() => {
    if (!revealId || !revealScope) {
      handledRevealId.current = null
      setPublicOpen(false)
      return
    }
    if (revealScope === 'public' && handledRevealId.current !== revealId) {
      handledRevealId.current = revealId
      setPublicOpen(true)
    }
    if (revealScope === 'self') setPrivateExpanded(true)
  }, [revealId, revealScope])

  if (!reveal) return null

  const acknowledgement = action.variables?.action.type === 'reveal.acknowledge' ? action.error : null
  const canAcknowledge = view.allowedActions.includes('reveal.acknowledge')
  const isAcknowledging = action.isPending && action.variables?.action.type === 'reveal.acknowledge'
  const acknowledgeButton = <Button className="w-full" disabled={!canAcknowledge || isAcknowledging || blockedByUncertainTransfer} onClick={() => submit({ type: 'reveal.acknowledge' })}>{isAcknowledging ? 'Acknowledging…' : 'Acknowledge and hide'}</Button>
  const retryButton = acknowledgement && <div className="reveal-action-error" role="alert"><p>{acknowledgement.message}</p><Button variant="outline" disabled={action.isPending || blockedByUncertainTransfer} onClick={() => retry()}>Retry acknowledgment</Button></div>

  if (isPublic) return <section className="public-reveal-entry" aria-label="Public ranking reveal">
    <div><Eye aria-hidden="true" /><span><strong>Public ranks revealed</strong><small>Play is paused until your team acknowledges.</small></span></div>
    <Dialog.Root open={publicOpen} onOpenChange={(open) => { if (!open && isAcknowledging) return; setPublicOpen(open) }}>
      <Dialog.Trigger asChild><Button variant="outline" className="public-reveal-open">View ranks</Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay reveal-dialog-overlay" />
        <Dialog.Content className="public-rank-dialog" aria-describedby="public-rank-description">
          <div className="reveal-dialog-heading"><div><Dialog.Title className="section-heading">Public ranks revealed</Dialog.Title><Dialog.Description id="public-rank-description" className="reveal-dialog-description">Everyone can see these ranks. Play stays paused until every team acknowledges. Balances stay private.</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close ranks" disabled={isAcknowledging}><X /></Button></Dialog.Close></div>
          <ol className="reveal-rank-list">{reveal.rankings.map((item) => <li key={item.teamId}><span>{view.teams.find((team) => team.id === item.teamId)?.name ?? 'Team'}</span><strong>Rank {item.rank}</strong></li>)}</ol>
          <div className="public-reveal-footer">
            {retryButton}
            {canAcknowledge ? acknowledgeButton : <p className="reveal-leader-note">Your team leader can acknowledge this reveal.</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </section>

  return <section className="private-reveal-surface" aria-labelledby="rank-reveal-heading" aria-live="polite">
    <div className="private-reveal-heading">
      <div className="private-reveal-title"><LockKeyhole className="size-5" aria-hidden="true" /><h2 id="rank-reveal-heading" className="section-heading">Your rank revealed</h2></div>
      <Button variant="ghost" size="sm" aria-expanded={privateExpanded} aria-controls="private-reveal-details" onClick={() => setPrivateExpanded((value) => !value)}>{privateExpanded ? 'Hide details' : 'View rank'}</Button>
    </div>
    <p className="private-reveal-copy">Only your team sees this rank. Other teams keep playing. The snapshot hides after your team acknowledges.</p>
    {privateExpanded && <div id="private-reveal-details" className="private-reveal-details">
      <ul className="reveal-rank-list">{reveal.rankings.map(item => <li key={item.teamId}><span>{view.teams.find(team => team.id === item.teamId)?.name ?? 'Your team'}</span><strong>Rank {item.rank}</strong></li>)}</ul>
      {retryButton}
      {canAcknowledge ? acknowledgeButton : <p className="reveal-leader-note">Your team leader can acknowledge this reveal.</p>}
    </div>}
  </section>
}
