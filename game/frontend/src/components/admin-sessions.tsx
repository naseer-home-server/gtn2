import { useMemo, useState, type SubmitEvent } from 'react'
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
  const { sessions, roster, create, activate } = useGameSessions()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const players = useMemo(() => roster.data ?? [], [roster.data])
  const selectedPlayers = useMemo(() => selectedIds.flatMap((id) => {
    const player = players.find((item) => item.id === id)
    return player ? [player] : []
  }), [players, selectedIds])
  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return players
    return players.filter((player) => `${player.name} ${player.email}`.toLocaleLowerCase().includes(query))
  }, [players, search])
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedIds.length || create.isPending) return
    create.mutate({ name, rosterIds: selectedIds }, { onSuccess: (session) => { setName(''); setSearch(''); setSelectedIds([]); navigate(`/admin/sessions/${session.id}`) } })
  }
  return <div className="space-y-8">
    <Card className="paper-panel">
      <CardHeader><CardTitle><h2 className="section-heading">Set up a session</h2></CardTitle><CardDescription>Choose up to {MAX_SESSION_PLAYERS} people from the private player roster.</CardDescription></CardHeader>
      <CardContent><form onSubmit={submit} className="session-create-form grid gap-5 lg:grid-cols-[0.8fr_1.2fr_auto] lg:items-end">
        <div className="space-y-2"><Label htmlFor="session-name">Session name</Label><Input className="h-12 text-base" id="session-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="Game Theory Night 2" /></div>
        <fieldset className="roster-picker min-w-0 space-y-3" disabled={create.isPending || roster.isPending}>
          <legend className="mb-2 text-sm font-medium">Choose players</legend>
          {roster.isPending ? <LoadingMessage /> : roster.error ? <div className="space-y-2"><ErrorMessage message={roster.error.message} /><Button type="button" variant="outline" className="min-h-11" onClick={() => void roster.refetch()}>Retry roster</Button></div> : <>
            <Input aria-label="Search roster by name or email" className="h-12 text-base" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" />
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{selectedIds.length} of {MAX_SESSION_PLAYERS} selected</span><span>{filteredPlayers.length} {filteredPlayers.length === 1 ? 'person' : 'people'}</span></div>
            <div className="roster-picker-list max-h-72 space-y-1 overflow-y-auto rounded-lg border border-input bg-background p-1" aria-label="Roster players">
              {filteredPlayers.length ? filteredPlayers.map((player) => {
                const checked = selectedIds.includes(player.id)
                const maxed = selectedIds.length >= MAX_SESSION_PLAYERS && !checked
                return <label key={player.id} className={`roster-picker-option flex min-h-14 cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${checked ? 'bg-primary/5' : 'hover:bg-muted/60'} ${maxed ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <input className="size-5 shrink-0 accent-primary" type="checkbox" checked={checked} disabled={maxed} onChange={(event) => setSelectedIds((current) => event.target.checked ? current.length < MAX_SESSION_PLAYERS ? [...current, player.id] : current : current.filter((id) => id !== player.id))} />
                  <span className="min-w-0"><span className="block break-words text-sm font-medium">{player.name}</span><span className="block break-all text-xs text-muted-foreground">{player.email}</span></span>
                </label>
              }) : <p className="px-3 py-5 text-sm text-muted-foreground">No roster players match “{search.trim()}”.</p>}
            </div>
            {selectedPlayers.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Selected players</p><ul className="flex flex-wrap gap-2">{selectedPlayers.map((player) => <li key={player.id}><button type="button" className="roster-selected-chip inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelectedIds((current) => current.filter((id) => id !== player.id))} aria-label={`Remove ${player.name}`}><span className="break-words">{player.name}</span><span aria-hidden="true">×</span></button></li>)}</ul></div>}
          </>}
        </fieldset>
        <div className="space-y-3">{create.error && <ErrorMessage message={create.error.message} />}<Button className="min-h-12 w-full lg:w-auto" disabled={create.isPending || roster.isPending || roster.isError || !name.trim() || selectedIds.length < 1}>{create.isPending ? 'Creating…' : 'Create session'}</Button></div>
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
