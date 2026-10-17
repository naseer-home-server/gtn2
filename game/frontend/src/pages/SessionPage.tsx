import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useGameSession } from '@/hooks/use-game-sessions'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'
import { AdminGame } from '@/components/admin-game'

const sections = ['setup', 'live', 'review'] as const
type Section = typeof sections[number]
export function SessionPage() {
  const { sessionId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSection = searchParams.get('section')
  const { session, arrive, reorder } = useGameSession(sessionId)
  if (session.isPending) return <LoadingMessage />
  if (session.error) return <ErrorMessage message={session.error.message} />
  const section: Section = sections.includes(rawSection as Section) ? rawSection as Section : session.data.currentGame ? 'live' : 'setup'
  const arrived = session.data.players.filter((p) => p.arrivalOrder !== null).sort((a, b) => a.arrivalOrder! - b.arrivalOrder!)
  const waiting = session.data.players.filter((p) => p.arrivalOrder === null)
  const pending = arrive.isPending || reorder.isPending
  const arrivalOrderLocked = session.data.currentGame !== null
  function selectSection(next: Section) {
    const params = new URLSearchParams(searchParams)
    params.set('section', next)
    setSearchParams(params, { replace: true })
  }
  function move(index: number, offset: number) {
    const ids = arrived.map((p) => p.id)
    ;[ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]
    reorder.mutate(ids)
  }
  return <div className="space-y-6">
    <Button asChild variant="ghost" className="min-h-11 px-0"><Link to="/admin">← Back to admin</Link></Button>
    <header className="page-intro admin-session-intro flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">Host session</p><h1 className="display-title break-words text-3xl sm:text-4xl">{session.data.name}</h1></div>{session.data.isActive && <Badge className="mt-2">Active session</Badge>}</header>
    <nav className="section-tabs sticky top-0 z-10 -mx-1 bg-background/95 py-2 backdrop-blur" aria-label="Session sections">{sections.map((item) => <Button key={item} className="min-h-11 flex-1 capitalize" variant={section === item ? 'default' : 'ghost'} aria-current={section === item ? 'page' : undefined} onClick={() => selectSection(item)}>{item === 'live' ? 'Live play' : item === 'setup' ? 'Setup' : 'Review'}</Button>)}</nav>
    {section === 'setup' && <div className="space-y-5">
      <Card className="paper-panel"><CardHeader><CardTitle><h2 className="section-heading">Arrival order</h2></CardTitle><CardDescription>Mark people as they arrive. Their first arrival fixes the tie order once play begins.</CardDescription></CardHeader><CardContent className="space-y-3">
        {arrived.length === 0 ? <p className="empty-state">Nobody has arrived yet.</p> : <ol className="divide-y divide-border/70">{arrived.map((player, index) => <li key={player.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="min-w-0 break-all"><span className="mr-3 font-semibold">{player.arrivalOrder}.</span>{player.email}</span><div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" className="min-h-11 min-w-14" aria-label={`Move ${player.email} earlier`} disabled={arrivalOrderLocked || pending || index === 0} onClick={() => move(index, -1)}>Up</Button><Button variant="outline" size="sm" className="min-h-11 min-w-14" aria-label={`Move ${player.email} later`} disabled={arrivalOrderLocked || pending || index === arrived.length - 1} onClick={() => move(index, 1)}>Down</Button></div></li>)}</ol>}
        {arrivalOrderLocked && <p className="text-sm text-muted-foreground">Arrival order is locked after play starts.</p>}{reorder.error && <ErrorMessage message={reorder.error.message} />}
      </CardContent></Card>
      <Card className="paper-panel"><CardHeader><CardTitle><h2 className="section-heading">Waiting to arrive</h2></CardTitle><CardDescription>Mark each invited player when they get here.</CardDescription></CardHeader><CardContent className="space-y-2">{waiting.length === 0 ? <p className="empty-state">Everyone has arrived.</p> : waiting.map((player) => <div key={player.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 py-3"><span className="min-w-0 break-all">{player.email}</span><Button className="min-h-11" disabled={pending} onClick={() => arrive.mutate(player.id)}>Mark arrived</Button></div>)}{arrive.error && <ErrorMessage message={arrive.error.message} />}</CardContent></Card>
    </div>}
    <AdminGame sessionId={sessionId} players={session.data.players} section={section} />
  </div>
}
