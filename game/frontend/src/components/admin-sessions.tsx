import { useState, type SubmitEvent } from 'react'
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
    create.mutate({ name, emails: emails.split(/[\s,;]+/).filter(Boolean) }, {
      onSuccess: (session) => { setName(''); setEmails(''); navigate(`/admin/sessions/${session.id}`) },
    })
  }
  return <div className="space-y-6">
    <Card>
      <CardHeader><CardTitle><h2>Create game session</h2></CardTitle><CardDescription>Invite up to ten people using the email they will log in with.</CardDescription></CardHeader>
      <CardContent><form onSubmit={submit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="session-name">Session name</Label><Input id="session-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="Game Theory Night 2" /></div>
        <div className="space-y-2"><Label htmlFor="player-emails">Player emails</Label><textarea id="player-emails" className="min-h-32 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={emails} onChange={(e) => setEmails(e.target.value)} required placeholder="One email per line" /><p className="text-sm text-muted-foreground">Separate emails with new lines or commas.</p></div>
        {create.error && <ErrorMessage message={create.error.message} />}
        <Button disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create session'}</Button>
      </form></CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle><h2>Game sessions</h2></CardTitle><CardDescription>Only invited players in the active session can log in. Switching sessions changes player access immediately.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {sessions.isPending ? <LoadingMessage /> : sessions.error ? <ErrorMessage message={sessions.error.message} /> : sessions.data.length === 0 ? <p className="text-sm text-muted-foreground">Create your first session above.</p> : sessions.data.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="space-y-1"><Link className="font-medium underline-offset-4 hover:underline" to={`/admin/sessions/${session.id}`}>{session.name}</Link><p className="text-sm text-muted-foreground">{session.players.length} invited · {session.players.filter((p) => p.arrivalOrder !== null).length} arrived</p></div>
          <div className="flex items-center gap-2">{session.isActive && <Badge>Active</Badge>}<Button variant="outline" disabled={activate.isPending} onClick={() => activate.mutate(session.isActive ? null : session.id)}>{session.isActive ? 'Deactivate' : 'Set active'}</Button><Button asChild variant="ghost"><Link to={`/admin/sessions/${session.id}`}>Arrival order</Link></Button></div>
        </div>)}
        {activate.error && <ErrorMessage message={activate.error.message} />}
      </CardContent>
    </Card>
  </div>
}
