import { Link, useParams } from 'react-router-dom'
import { useGameSession } from '@/hooks/use-game-sessions'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'

export function SessionPage() {
  const { sessionId = '' } = useParams()
  const { session, arrive, reorder } = useGameSession(sessionId)
  if (session.isPending) return <LoadingMessage />
  if (session.error) return <ErrorMessage message={session.error.message} />
  const arrived = session.data.players.filter((p) => p.arrivalOrder !== null).sort((a, b) => a.arrivalOrder! - b.arrivalOrder!)
  const waiting = session.data.players.filter((p) => p.arrivalOrder === null)
  const pending = arrive.isPending || reorder.isPending
  function move(index: number, offset: number) {
    const ids = arrived.map((p) => p.id)
    ;[ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]
    reorder.mutate(ids)
  }
  return <div className="space-y-6">
    <Button asChild variant="outline"><Link to="/admin">Back to admin</Link></Button>
    <div className="flex items-center gap-3"><h1 className="text-2xl font-semibold">{session.data.name}</h1>{session.data.isActive && <Badge>Active</Badge>}</div>
    <Card><CardHeader><CardTitle><h2>Arrival order</h2></CardTitle><CardDescription>Mark people as they arrive. Move them up or down to correct the absolute order.</CardDescription></CardHeader><CardContent className="space-y-3">
      {arrived.length === 0 && <p className="text-sm text-muted-foreground">Nobody has arrived yet.</p>}
      <ol className="space-y-2">{arrived.map((player, index) => <li key={player.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
        <span className="break-all"><span className="mr-3 font-semibold">{player.arrivalOrder}.</span>{player.email}</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" aria-label={`Move ${player.email} earlier`} disabled={pending || index === 0} onClick={() => move(index, -1)}>Up</Button><Button variant="outline" size="sm" aria-label={`Move ${player.email} later`} disabled={pending || index === arrived.length - 1} onClick={() => move(index, 1)}>Down</Button></div>
      </li>)}</ol>
      {reorder.error && <ErrorMessage message={reorder.error.message} />}
    </CardContent></Card>
    <Card><CardHeader><CardTitle><h2>Waiting to arrive</h2></CardTitle></CardHeader><CardContent className="space-y-2">
      {waiting.length === 0 && <p className="text-sm text-muted-foreground">Everyone has arrived.</p>}
      {waiting.map((player) => <div key={player.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><span className="break-all">{player.email}</span><Button disabled={pending} onClick={() => arrive.mutate(player.id)}>Mark arrived</Button></div>)}
      {arrive.error && <ErrorMessage message={arrive.error.message} />}
    </CardContent></Card>
  </div>
}
