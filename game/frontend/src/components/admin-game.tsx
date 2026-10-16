import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { GameConfig, GameId, TeamAssignment } from 'backend/game'
import { MIN_TEAMS, MAX_TEAMS, MAX_SESSION_PLAYERS } from '../../../backend/src/engine/limits'
import { useAdminGame } from '@/hooks/use-gameplay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'
import { trpc } from '@/trpc'
import { ActivityCard, TeamAccounts } from '@/components/game-activity/ActivityCard'
import { gameActivities } from '@/components/game-activity/model'

type DraftTeam = { name: string; first: string; second: string }
const GAME_ORDER: GameId[] = ['bonus', 'high-low', 'cave', 'circle', 'bomb']
const GAME_NAMES: Record<GameId, string> = { bonus: 'Will we get bonus this year', 'high-low': 'High or low', cave: 'Cave mining', circle: 'What goes around comes around', bomb: 'Gamble bomb' }
const freshTeam = (): DraftTeam => ({ name: '', first: '', second: '' })

type SessionPlayer = { id: string; email: string; arrivalOrder: number | null }
export function AdminGame({ sessionId, players }: { sessionId: string; players: SessionPlayer[] }) {
  const { defaults, state, start, startRound, advance, reset } = useAdminGame(sessionId)
  const [teams, setTeams] = useState<DraftTeam[]>([freshTeam(), freshTeam()])
  const [configText, setConfigText] = useState('')
  const [configTouched, setConfigTouched] = useState(false)
  const [configParseError, setConfigParseError] = useState('')
  const [startingGame, setStartingGame] = useState<GameId>('bonus')
  const [reviewTab, setReviewTab] = useState<'events' | 'chats'>('events')
  const chats = useQuery({
    queryKey: ['admin', 'chats', sessionId],
    queryFn: () => trpc.admin.chats.audit.query({ sessionId }),
    enabled: Boolean(sessionId && state.data?.state),
    refetchInterval: 2_000,
  })
  const arrived = useMemo(() => players.filter((p) => p.arrivalOrder !== null).sort((a, b) => a.arrivalOrder! - b.arrivalOrder!), [players])
  useEffect(() => {
    if (defaults.data && !configTouched) setConfigText(JSON.stringify(defaults.data, null, 2))
  }, [defaults.data, configTouched])

  if (state.isPending || defaults.isPending) return <LoadingMessage />
  if (state.error) return <ErrorMessage message={state.error.message} />
  if (defaults.error) return <ErrorMessage message={defaults.error.message} />
  const view = state.data
  const engine = view.state
  const nextGame = engine ? GAME_ORDER[engine.gameIndex + (engine.round === 3 ? 1 : 0)] : undefined
  const nextRound = engine ? (engine.round === 3 ? 1 : engine.round + 1) : undefined
  const allIds = teams.flatMap((team) => [team.first, team.second].filter(Boolean))
  const validTeams = teams.length >= MIN_TEAMS && teams.length <= MAX_TEAMS && teams.every((team) => team.name.trim() && team.first)
  const soloCount = teams.filter((team) => team.first && !team.second).length
  const soloMatchesAttendance = allIds.length % 2 === soloCount
  const validPeople = allIds.length >= 2 && allIds.length <= MAX_SESSION_PLAYERS && new Set(allIds).size === allIds.length
  const canStart = Boolean(validTeams && soloMatchesAttendance && validPeople && !start.isPending)
  const activities = engine ? gameActivities(view.events, engine.teams) : []
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
    <CardHeader><CardTitle><h2>Gameplay control</h2></CardTitle><CardDescription>Assign arrived players to teams and configure the shared rules. The session setup and each round start are separate host actions.</CardDescription></CardHeader>
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
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Teams</h3><Button variant="outline" disabled={teams.length >= MAX_TEAMS} onClick={() => setTeams((items) => [...items, freshTeam()])}>Add team</Button></div>
          <p className="text-sm text-muted-foreground">Choose {MIN_TEAMS}–{MAX_TEAMS} teams from arrived players. One team may be solo when attendance is odd.</p>
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
        <Button disabled={!canStart || !configText.trim()} onClick={begin}>{start.isPending ? 'Preparing…' : `Prepare ${GAME_NAMES[startingGame]} · round 1`}</Button>
      </> : <>
        <p className="text-sm text-muted-foreground">Each completed round waits for the host to start the next round.</p>
        <div className="flex flex-wrap items-center gap-2"><Badge>{engine.status}</Badge><span className="font-medium">{engine.current.game} · Round {engine.round}</span><span className="text-sm text-muted-foreground">Phase: {engine.current.phase}</span></div>
        <div className="flex flex-wrap items-center gap-2">{engine.status === 'playing' && engine.current.phase === 'ready' && <Button disabled={startRound.isPending || reset.isPending} onClick={() => startRound.mutate()}>{startRound.isPending ? 'Starting…' : `Start ${GAME_NAMES[engine.current.game]} · round ${engine.round}`}</Button>}{engine.status === 'playing' && engine.current.phase === 'complete' && nextGame && nextRound && <Button disabled={advance.isPending || reset.isPending} onClick={() => advance.mutate()}>{advance.isPending ? 'Starting…' : `Start ${GAME_NAMES[nextGame]} · round ${nextRound}`}</Button>}{engine.status === 'finished' && <p className="text-sm text-muted-foreground">Game finished.</p>}<Button variant="destructive" disabled={reset.isPending || advance.isPending || startRound.isPending} onClick={resetPlaythrough}>{reset.isPending ? 'Resetting…' : 'Reset current game'}</Button>{startRound.error && <ErrorMessage message={startRound.error.message} />}{advance.error && <ErrorMessage message={advance.error.message} />}{reset.error && <ErrorMessage message={reset.error.message} />}</div>
        <TeamAccounts teams={engine.teams} finished={engine.status === 'finished'} />
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">Game review</h3><p className="text-sm text-muted-foreground">Choices, outcomes, reveal contributions, and every chat room.</p></div><div className="inline-flex rounded-lg border p-1"><Button size="sm" variant={reviewTab === 'events' ? 'secondary' : 'ghost'} onClick={() => setReviewTab('events')}>Game events</Button><Button size="sm" variant={reviewTab === 'chats' ? 'secondary' : 'ghost'} onClick={() => setReviewTab('chats')}>Chat rooms ({chats.data?.conversations.length ?? 0})</Button></div></div>
          {reviewTab === 'events' ? <div className="max-h-[32rem] overflow-auto rounded-lg border p-3">{activities.length === 0 ? <p className="text-sm text-muted-foreground">No game activity yet.</p> : [...activities].reverse().map((activity) => <ActivityCard key={activity.id} activity={activity} teams={engine.teams} />)}</div> : <div className="max-h-[32rem] space-y-3 overflow-auto rounded-lg border p-3">{chats.isPending ? <p className="text-sm text-muted-foreground">Loading chat rooms…</p> : chats.error ? <ErrorMessage message={chats.error.message} /> : !chats.data?.conversations.length ? <p className="text-sm text-muted-foreground">No chat rooms yet.</p> : chats.data.conversations.map(({ conversation, messages }) => {
            const members = conversation.playerIds.map((id) => chats.data!.players.find((player) => player.id === id)?.email ?? id)
            return <article key={conversation.id} className="overflow-hidden rounded-lg border"><div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2"><div><p className="text-sm font-medium">{conversation.kind === 'group' ? conversation.name : 'Private team chat'}</p><p className="text-xs text-muted-foreground">{conversation.kind === 'direct' ? 'Private' : 'Group'} · {members.join(', ')}</p></div><Badge variant="outline">{messages.length} messages</Badge></div><div className="max-h-72 space-y-2 overflow-auto p-3">{messages.length ? messages.map((message) => <div key={message.id} className="rounded-md bg-muted/50 px-3 py-2"><div className="flex justify-between gap-3 text-xs text-muted-foreground"><span className="font-medium text-foreground">{chats.data!.players.find((player) => player.id === message.senderPlayerId)?.email ?? 'Unknown player'}</span><time>{new Date(message.createdAt).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.text}</p></div>) : <p className="text-sm text-muted-foreground">No messages yet.</p>}</div></article>
          })}</div>}
        </section>
      </>}
    </CardContent>
  </Card>
}
