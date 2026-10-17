import { useEffect, useState, type FormEvent } from 'react'
import { usePlayerSession } from '@/features/player/player-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function StarTransferCard() {
  const { view, submit, retry, action, blockedByUncertainTransfer } = usePlayerSession()
  const [recipientTeamId, setRecipientTeamId] = useState('')
  const [stars, setStars] = useState('1')
  const [notice, setNotice] = useState('')
  const canSend = view.isTeamLeader && view.allowedActions.includes('stars.transfer')
  const recipients = view.teams.filter(team => team.id !== view.team?.id)
  const amount = Number(stars)
  const valid = /^\d+$/.test(stars) && Number.isSafeInteger(amount) && amount > 0 && amount <= (view.team?.stars ?? 0)

  useEffect(() => {
    setRecipientTeamId('')
    setStars('1')
    setNotice('')
  }, [view.token])

  useEffect(() => {
    if (action.isSuccess && action.variables?.action.type === 'stars.transfer') {
      setNotice(`Sent ${action.variables.action.stars} ${action.variables.action.stars === 1 ? 'star' : 'stars'}.`)
      setStars('1')
      setRecipientTeamId('')
    }
  }, [action.data, action.isSuccess, action.variables])

  const submitTransfer = (event: FormEvent) => {
    event.preventDefault()
    if (!canSend || !valid || !recipientTeamId || action.isPending) return
    setNotice('')
    submit({ type: 'stars.transfer', recipientTeamId, stars: amount })
  }

  return <Card className="transfer-panel">
    <CardHeader><CardTitle><h2>Send stars</h2></CardTitle><CardDescription>Trade stars with another team before the finale advantage is set. Agree any terms in person; money transfers are made separately.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {view.starsTransferOpen ? canSend ? <form className="space-y-4" onSubmit={submitTransfer}>
        <label className="block space-y-2 text-sm"><span>Recipient team</span><select className="h-10 w-full rounded-md border bg-background px-3" value={recipientTeamId} onChange={event => setRecipientTeamId(event.target.value)}><option value="">Choose a team</option>{recipients.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
        <label className="block space-y-2 text-sm"><span>Stars to send</span><input className="h-10 w-full rounded-md border bg-background px-3" type="number" min="1" max={view.team?.stars ?? 0} step="1" value={stars} onChange={event => setStars(event.target.value)} /></label>
        <p className="text-sm text-muted-foreground">Your team has {view.team?.stars ?? 0} stars. The public totals update as soon as a transfer is accepted.</p>
        {action.error && action.variables?.action.type === 'stars.transfer' && <div className="space-y-2 text-sm text-destructive" role="alert"><p>{action.error.message}</p>{blockedByUncertainTransfer && <><p>The result is uncertain. Retry the same request to confirm it safely.</p><Button type="button" variant="outline" disabled={action.isPending} onClick={retry}>Retry the same transfer</Button></>}</div>}
        <Button type="submit" disabled={!valid || !recipientTeamId || action.isPending || blockedByUncertainTransfer}>{action.isPending ? 'Sending…' : 'Send stars'}</Button>
      </form> : <p className="text-sm text-muted-foreground">Your team leader can send stars during this window.</p> : <p className="text-sm text-muted-foreground">Star trading is closed. It opens after the circle game and closes when the host starts the finale.</p>}
      {notice && <p role="status" className="text-sm font-medium">{notice}</p>}
    </CardContent>
  </Card>
}
