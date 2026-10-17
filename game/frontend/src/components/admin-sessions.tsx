import { useState, type SubmitEvent } from 'react'
import { MAX_SESSION_PLAYERS } from '../../../backend/src/engine/limits'
import { Link, useNavigate } from 'react-router-dom'
import { useGameSessions } from '@/hooks/use-game-sessions'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'

export function AdminSessions() {
  const { sessions, create, activate } = useGameSessions()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [emails, setEmails] = useState('')
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    create.mutate({ name, emails: emails.split(/[\s,;]+/).filter(Boolean) }, { onSuccess: (session) => { setName(''); setEmails(''); navigate(`/admin/sessions/${session.id}`) } })
  }
  return <div className="space-y-8">
    <Card className="paper-panel">
      <CardHeader><CardTitle><h2 className="section-heading">Set up a session</h2></CardTitle><CardDescription>Invite up to {MAX_SESSION_PLAYERS} people using the email they will log in with.</CardDescription></CardHeader>
      <CardContent><form onSubmit={submit} className="session-create-form grid gap-5 lg:grid-cols-[0.8fr_1.2fr_auto] lg:items-end">
        <div className="space-y-2"><Label htmlFor="session-name">Session name</Label><Input className="h-12 text-base" id="session-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="Game Theory Night 2" /></div>
        <div className="space-y-2"><Label htmlFor="player-emails">Player emails</Label><textarea id="player-emails" className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={emails} onChange={(e) => setEmails(e.target.value)} required placeholder="One email per line" /><p className="text-sm text-muted-foreground">Separate emails with new lines or commas.</p></div>
        <div className="space-y-3">{create.error && <ErrorMessage message={create.error.message} />}<Button className="min-h-12 w-full lg:w-auto" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create session'}</Button></div>
      </form></CardContent>
    </Card>
    <section className="session-list-section space-y-3" aria-labelledby="sessions-heading">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="sessions-heading" className="section-heading">Game sessions</h2><p className="mt-1 text-sm text-muted-foreground">Switching the active session changes player access immediately.</p></div></div>
      {sessions.isPending ? <LoadingMessage /> : sessions.error ? <ErrorMessage message={sessions.error.message} /> : sessions.data.length === 0 ? <p className="empty-state">Create your first session above.</p> : <div className="session-list">{sessions.data.map((session) => <article key={session.id} className={`session-list-item flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between${session.isActive ? ' is-active' : ''}`}>
        <div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><Link className="break-words text-lg font-medium underline-offset-4 hover:underline" to={`/admin/sessions/${session.id}`}>{session.name}</Link>{session.isActive && <Badge>Active</Badge>}</div><p className="text-sm text-muted-foreground">{session.players.length} invited · {session.players.filter((p) => p.arrivalOrder !== null).length} arrived</p></div>
        <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" disabled={activate.isPending} onClick={() => activate.mutate(session.isActive ? null : session.id)}>{session.isActive ? 'Deactivate' : 'Set active'}</Button><Button className="min-h-11" variant="ghost" asChild><Link to={`/admin/sessions/${session.id}`}>Manage session</Link></Button></div>
      </article>)}</div>}
      {activate.error && <ErrorMessage message={activate.error.message} />}
    </section>
  </div>
}
