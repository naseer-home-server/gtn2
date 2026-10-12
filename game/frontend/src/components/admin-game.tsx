import { useEffect, useMemo, useState } from 'react'
import type { GameConfig, GameId, TeamAssignment } from 'backend/game'
import { useAdminGame } from '@/hooks/use-gameplay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'

type DraftTeam = { name: string; first: string; second: string }
const GAME_ORDER: GameId[] = ['bonus', 'high-low', 'cave', 'circle', 'bomb']
const freshTeam = (): DraftTeam => ({ name: '', first: '', second: '' })
const money = (cents: string) => {
  const value = BigInt(cents)
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

type SessionPlayer = { id: string; email: string; arrivalOrder: number | null }
export function AdminGame({ sessionId, players }: { sessionId: string; players: SessionPlayer[] }) {
  const { defaults, state, start, advance, reset } = useAdminGame(sessionId)
  const [teams, setTeams] = useState<DraftTeam[]>([freshTeam(), freshTeam()])
  const [configText, setConfigText] = useState('')
  const [configTouched, setConfigTouched] = useState(false)
  const [configParseError, setConfigParseError] = useState('')
  const [startingGame, setStartingGame] = useState<GameId>('bonus')
  const arrived = useMemo(() => players.filter((p) => p.arrivalOrder !== null).sort((a, b) => a.arrivalOrder! - b.arrivalOrder!), [players])
  useEffect(() => {
    if (defaults.data && !configTouched) setConfigText(JSON.stringify(defaults.data, null, 2))
  }, [defaults.data, configTouched])

  if (state.isPending || defaults.isPending) return <LoadingMessage />
  if (state.error) return <ErrorMessage message={state.error.message} />
  if (defaults.error) return <ErrorMessage message={defaults.error.message} />
  const view = state.data
  const engine = view.state
  const allIds = teams.flatMap((team) => [team.first, team.second].filter(Boolean))
  const validTeams = teams.length >= 2 && teams.length <= 5 && teams.every((team) => team.name.trim() && team.first)
  const soloCount = teams.filter((team) => team.first && !team.second).length
  const soloMatchesAttendance = allIds.length % 2 === soloCount
  const validPeople = allIds.length >= 2 && allIds.length <= 10 && new Set(allIds).size === allIds.length
  const canStart = Boolean(validTeams && soloMatchesAttendance && validPeople && !start.isPending)
  const playerName = (id: string) => arrived.find((player) => player.id === id)?.email ?? id
  function updateTeam(index: number, key: keyof DraftTeam, value: string) {
    setTeams((items) => items.map((team, i) => i === index ? { ...team, [key]: value } : team))
  }
  function optionsFor(current: string) {
    const used = new Set(teams.flatMap((team) => [team.first, team.second]).filter(Boolean))
    return arrived.filter((player) => player.id === current || !used.has(player.id))
  }
  function begin() {
    let config: GameConfig
    try { config = JSON.parse(configText) as GameConfig; setConfigParseError('') } catch (error) { setConfigParseError(error instanceof Error ? error.message : 'Configuration must be valid JSON.'); return }
    const assignments: TeamAssignment[] = teams.map((team) => ({ name: team.name.trim(), playerIds: [team.first, team.second].filter(Boolean) }))
    start.mutate({ teams: assignments, config, startingGame })
  }
  function resetPlaythrough() {
    if (engine && window.confirm(`Reset ${engine.current.game} to round 1? Earnings and stars from this game will be cleared. Balances, stars, and results from earlier games will be preserved.`)) reset.mutate()
  }

  return <Card>
    <CardHeader><CardTitle><h2>Gameplay control</h2></CardTitle><CardDescription>Assign arrived players to teams, configure the shared rules, then start the session.</CardDescription></CardHeader>
    <CardContent className="space-y-6">
      {!engine ? <>
        <section className="max-w-sm space-y-2">
          <Label htmlFor="starting-game">Start at game</Label>
          <select id="starting-game" className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" value={startingGame} onChange={(event) => setStartingGame(event.target.value as GameId)}>
            {GAME_ORDER.map((game) => <option key={game} value={game}>{game}</option>)}
          </select>
          <p className="text-sm text-muted-foreground">Useful for preview sessions. The session starts at round 1 of this game.</p>
        </section>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Teams</h3><Button variant="outline" disabled={teams.length >= 5} onClick={() => setTeams((items) => [...items, freshTeam()])}>Add team</Button></div>
          <p className="text-sm text-muted-foreground">Choose 2–5 teams from arrived players. One team may be solo when attendance is odd.</p>
          {teams.map((team, index) => <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <div className="space-y-1"><Label htmlFor={`team-${index}-name`}>Team name</Label><Input id={`team-${index}-name`} value={team.name} onChange={(e) => updateTeam(index, 'name', e.target.value)} placeholder={`Team ${index + 1}`} /></div>
            {(['first', 'second'] as const).map((slot) => <div key={slot} className="space-y-1"><Label htmlFor={`team-${index}-${slot}`}>{slot === 'first' ? 'Player 1' : 'Player 2'}</Label><select id={`team-${index}-${slot}`} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm" value={team[slot]} onChange={(e) => updateTeam(index, slot, e.target.value)}><option value="">Select arrived player</option>{optionsFor(team[slot]).map((player) => <option key={player.id} value={player.id}>{player.email}</option>)}</select></div>)}
            <Button variant="ghost" disabled={teams.length <= 2} onClick={() => setTeams((items) => items.filter((_, i) => i !== index))}>Remove</Button>
          </div>)}
          {arrived.length < 2 && <p className="text-sm text-destructive">At least two players must have arrived.</p>}
        </section>
        <section className="space-y-3">
          <div><Label htmlFor="game-config">Game configuration (JSON)</Label><p className="text-sm text-muted-foreground">Money and thresholds use currency units. Invalid configuration is reported by the server.</p></div>
          <textarea id="game-config" value={configText} onChange={(e) => { setConfigTouched(true); setConfigParseError(''); setConfigText(e.target.value) }} spellCheck={false} className="min-h-72 w-full rounded-lg border border-input bg-transparent p-3 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
        </section>
        {configParseError && <ErrorMessage message={`Invalid configuration JSON: ${configParseError}`} />}
        {start.error && <ErrorMessage message={start.error.message} />}
        <Button disabled={!canStart || !configText.trim()} onClick={begin}>{start.isPending ? 'Starting…' : `Start at ${startingGame} · round 1`}</Button>
      </> : <>
        <div className="flex flex-wrap items-center gap-2"><Badge>{engine.status}</Badge><span className="font-medium">{engine.current.game} · Round {engine.round}</span><span className="text-sm text-muted-foreground">Phase: {engine.current.phase}</span></div>
        <div className="flex flex-wrap items-center gap-2">{engine.status === 'playing' && engine.current.phase === 'complete' && <Button disabled={advance.isPending || reset.isPending} onClick={() => advance.mutate()}>{advance.isPending ? 'Advancing…' : 'Advance game'}</Button>}{engine.status === 'finished' && <p className="text-sm text-muted-foreground">Game finished.</p>}<Button variant="destructive" disabled={reset.isPending || advance.isPending} onClick={resetPlaythrough}>{reset.isPending ? 'Resetting…' : 'Reset current game'}</Button>{advance.error && <ErrorMessage message={advance.error.message} />}{reset.error && <ErrorMessage message={reset.error.message} />}</div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Team</th><th className="p-2">Balance</th><th className="p-2">Stars</th><th className="p-2">Players</th></tr></thead><tbody>{engine.teams.map((team) => <tr key={team.id} className="border-b"><td className="p-2 font-medium">{team.name}</td><td className="p-2">{money(team.balance)}</td><td className="p-2">{team.stars}</td><td className="p-2">{team.playerIds.map(playerName).join(', ')}</td></tr>)}</tbody></table></div>
        <section className="space-y-2"><h3 className="font-medium">Engine state</h3><pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(engine, null, 2)}</pre></section>
        <section className="space-y-2"><h3 className="font-medium">Event log</h3><div className="max-h-96 space-y-2 overflow-auto rounded-lg border p-3">{view.events.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : view.events.map((event) => {
          const teamId = typeof event.data.teamId === 'string' ? event.data.teamId : null
          const teamName = teamId ? engine.teams.find((team) => team.id === teamId)?.name ?? teamId : null
          const playerId = typeof event.data.playerId === 'string' ? event.data.playerId : null
          const playerEmail = playerId ? players.find((player) => player.id === playerId)?.email ?? playerId : null
          return <div key={event.id} className="border-b pb-2 last:border-0"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{event.type}{teamName && ` · ${teamName}`}{playerEmail && ` · ${playerEmail}`} · actor {event.actorId}</span><time>{new Date(event.createdAt).toLocaleString()}</time></div><pre className="mt-1 whitespace-pre-wrap break-words text-xs">{JSON.stringify(event.data)}</pre></div>
        })}</div></section>
      </>}
    </CardContent>
  </Card>
}
