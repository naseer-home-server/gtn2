import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AdminControl, EngineState, GameConfig, GameId, TeamAssignment } from 'backend/game'
import { MIN_TEAMS, MAX_TEAMS } from '../../../backend/src/engine/limits'
import { useAdminGame } from '@/hooks/use-gameplay'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'
import { trpc } from '@/trpc'
import { ActivityCard } from '@/components/game-activity/ActivityCard'
import { gameActivities } from '@/components/game-activity/model'
import { GAME_ORDER, gameNames } from '@/lib/game-display'
import { AdminChatAuditViewer } from '@/features/admin/admin-chat-audit'
import { TeamAssignmentEditor } from '@/features/admin/team-assignment'
import { AdminTeamAccounts } from '@/features/admin/team-account-editor'
import { GameConfigEditor } from '@/features/admin/game-config-editor'
import { CircleChains } from '@/features/admin/circle-chains'

type SessionPlayer = { id: string; email: string; arrivalOrder: number | null; name?: string | null; firstName?: string | null }
type AdminSection = 'setup' | 'live' | 'review'
const freshTeams = (): TeamAssignment[] => [{ name: '', playerIds: [] }, { name: '', playerIds: [] }]

function PreGameTuning({ engine, disabled, onValidityChange, onChange }: { engine: EngineState; disabled: boolean; onValidityChange: (valid: boolean) => void; onChange: (config: GameConfig) => void }) {
  const game = engine.current.phase === 'ready' ? engine.current.game : GAME_ORDER[engine.gameIndex + 1]
  const [draft, setDraft] = useState(engine.config)
  if (!game) return null
  return <section className="admin-tool"><h2 className="section-heading">Before {gameNames[game]}</h2><p className="mt-2 mb-5 text-sm text-muted-foreground">Tune this game's three rounds before starting. Starting applies these settings together; they stay fixed throughout the game.</p><GameConfigEditor value={draft} game={game} disabled={disabled} onValidityChange={onValidityChange} onChange={value => { setDraft(value); onChange(value) }} /></section>
}

export function AdminGame({ sessionId, players, section = 'setup' }: { sessionId: string; players: SessionPlayer[]; section?: AdminSection }) {
  const { defaults, state, start, startRound, advance, reset, adjustAccount } = useAdminGame(sessionId)
  const [teams, setTeams] = useState(freshTeams)
  const [setupConfig, setSetupConfig] = useState<GameConfig>()
  const [setupValid, setSetupValid] = useState(true)
  const [tuningValid, setTuningValid] = useState(true)
  const [tuning, setTuning] = useState<GameConfig>()
  const [startingGame, setStartingGame] = useState<GameId>('bonus')
  const [reviewTab, setReviewTab] = useState<'events' | 'chats' | 'circles'>('events')
  const chats = useQuery({ queryKey: ['admin', 'chats', sessionId], queryFn: () => trpc.admin.chats.audit.query({ sessionId }), enabled: Boolean(sessionId && section === 'review'), refetchInterval: 2_000 })
  const token = state.data?.state?.current.token
  useEffect(() => { setTuning(undefined); setTuningValid(true) }, [token])
  if (state.isPending || defaults.isPending) return <LoadingMessage />
  if (state.error) return <ErrorMessage message={state.error.message} />
  if (defaults.error) return <ErrorMessage message={defaults.error.message} />
  const view = state.data, engine = view.state
  const selected = teams.flatMap(team => team.playerIds)
  const soloCount = teams.filter(team => team.playerIds.length === 1).length
  const canPrepare = teams.length >= MIN_TEAMS && teams.length <= MAX_TEAMS && teams.every(team => team.playerIds.length >= 1 && team.playerIds.length <= 2) && soloCount <= 1 && new Set(selected).size === selected.length && selected.every(id => players.some(player => player.id === id && player.arrivalOrder !== null)) && setupValid
  const busy = start.isPending || advance.isPending || startRound.isPending || reset.isPending
  const nextGame = engine ? GAME_ORDER[engine.gameIndex + (engine.round === 3 ? 1 : 0)] : undefined
  const nextRound = engine ? engine.round === 3 ? 1 : engine.round + 1 : undefined
  const canTune = engine?.status === 'playing' && (engine.current.phase === 'ready' && engine.round === 1 || engine.current.phase === 'complete' && engine.round === 3 && Boolean(nextGame))
  const activities = engine ? gameActivities(view.events, engine.teams) : []
  function control(): AdminControl { return { requestId: crypto.randomUUID(), expectedRevision: engine!.revision, ...(canTune && tuning ? { config: tuning } : {}) } }
  function resetGame() {
    if (engine && window.confirm(`Reset ${gameNames[engine.current.game]} to round 1? This undoes all money, star, transfer, reveal-pot and account edits since this game's start checkpoint. Earlier games are preserved.`)) reset.mutate()
  }
  if (section === 'setup') return <section className="admin-tool"><h2 className="section-heading">Prepare the game</h2>{engine ? <p className="mt-4 text-sm text-muted-foreground">Teams are fixed for this playthrough. Tune the next game from Live play before starting it.</p> : <div className="admin-setup-grid mt-6"><div className="space-y-6"><div className="space-y-2"><Label htmlFor="starting-game">Start at game</Label><select id="starting-game" className="h-11 w-full rounded-lg border bg-card px-3" value={startingGame} onChange={e => setStartingGame(e.target.value as GameId)}>{GAME_ORDER.map(game => <option key={game} value={game}>{gameNames[game]}</option>)}</select><p className="text-sm text-muted-foreground">Prepare round 1. Players wait without seeing rules until you start.</p></div><TeamAssignmentEditor players={players} value={teams} onChange={setTeams} disabled={busy} /><Button disabled={!canPrepare || busy} className="min-h-12" onClick={() => start.mutate({ teams, config: setupConfig ?? defaults.data, startingGame })}>{start.isPending ? 'Preparing…' : 'Prepare teams and game'}</Button>{start.error && <ErrorMessage message={start.error.message} />}</div><div><h3 className="mb-4 font-medium">Game settings</h3><GameConfigEditor value={setupConfig ?? defaults.data} onChange={setSetupConfig} disabled={busy} onValidityChange={setSetupValid} /></div></div>}</section>

  if (section === 'review') return <section className="admin-tool"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="section-heading">Review the night</h2><p className="mt-2 text-sm text-muted-foreground">Host-only events, chats and actual circle chains.</p></div><nav className="section-tabs" aria-label="Review content">{(['events','chats','circles'] as const).map(tab => <Button key={tab} variant="ghost" aria-current={reviewTab === tab ? 'page' : undefined} onClick={() => setReviewTab(tab)}>{tab === 'events' ? 'Game events' : tab === 'chats' ? 'Chat rooms' : 'Circle chains'}</Button>)}</nav></div><div className="mt-6">{reviewTab === 'chats' ? chats.isPending ? <LoadingMessage /> : chats.error ? <ErrorMessage message={chats.error.message} /> : chats.data && <AdminChatAuditViewer audit={chats.data} /> : !engine ? <p className="empty-state">Prepare the game to begin its review.</p> : reviewTab === 'circles' ? <CircleChains state={engine} events={view.events} /> : <div className="admin-event-list">{activities.length ? [...activities].reverse().map(activity => <ActivityCard key={activity.id} activity={activity} teams={engine.teams} />) : <p className="empty-state">No game activity yet.</p>}</div>}</div></section>

  if (!engine) return <section className="admin-tool"><h2 className="section-heading">Ready to begin</h2><p className="mt-4 text-sm text-muted-foreground">Assign teams and prepare the game in Setup.</p></section>
  return <div className="admin-live-grid"><div className="space-y-6 min-w-0"><section className="admin-tool admin-live-controls"><div className="flex flex-wrap items-center gap-3"><Badge>{engine.status === 'finished' ? 'Finished' : engine.current.phase === 'ready' ? 'Ready to start' : engine.current.phase === 'complete' ? 'Round complete' : 'In play'}</Badge><span className="text-sm text-muted-foreground">Round {engine.round} of 3 · {engine.current.phase}</span></div><h2 className="section-heading mt-4">{gameNames[engine.current.game]}</h2><div className="mt-6 flex flex-wrap gap-3">{engine.status === 'playing' && engine.current.phase === 'ready' && <Button className="min-h-12" disabled={busy || !tuningValid || Boolean(engine.reveal)} onClick={() => startRound.mutate(control())}>{startRound.isPending ? 'Starting…' : `Start ${gameNames[engine.current.game]} · round ${engine.round}`}</Button>}{engine.status === 'playing' && engine.current.phase === 'complete' && <Button className="min-h-12" disabled={busy || !tuningValid || Boolean(engine.reveal)} onClick={() => advance.mutate(control())}>{advance.isPending ? 'Starting…' : nextGame ? `Start ${gameNames[nextGame]} · round ${nextRound}` : 'Finish game night'}</Button>}<Button variant="outline" className="min-h-12" disabled={busy} onClick={resetGame}>{reset.isPending ? 'Resetting…' : 'Reset current game'}</Button></div>{engine.reveal && <p className="mt-4 text-sm">Waiting for every team to acknowledge the public ranks.</p>}{[startRound.error,advance.error,reset.error].filter(Boolean).map((error,i) => <div className="mt-4" key={i}><ErrorMessage message={error!.message} />{i === 0 && startRound.isError && Boolean(startRound.variables) && <Button variant="outline" className="mt-2" onClick={() => startRound.mutate(startRound.variables)}>Retry same start</Button>}{advance.isError && Boolean(advance.variables) && <Button variant="outline" className="mt-2" onClick={() => advance.mutate(advance.variables)}>Retry same advance</Button>}</div>)}</section>
      {canTune && <PreGameTuning key={token} engine={engine} disabled={busy} onChange={setTuning} onValidityChange={setTuningValid} />}
      {(engine.current.game === 'circle' || view.events.some(event => event.type === 'circle.started')) && <CircleChains state={engine} events={view.events} />}
    </div><aside className="admin-accounts-column"><AdminTeamAccounts teams={engine.teams} revision={engine.revision} pending={adjustAccount.isPending} error={adjustAccount.error?.message} onSave={command => adjustAccount.mutate(command)} onRetry={() => { if (adjustAccount.variables) adjustAccount.mutate(adjustAccount.variables) }} onRefresh={() => { adjustAccount.reset(); void state.refetch() }} /><section className="admin-tool mt-6"><h2 className="section-heading">Recent activity</h2><div className="mt-4 admin-recent-events">{activities.length ? [...activities].reverse().slice(0, 6).map(activity => <ActivityCard key={activity.id} activity={activity} teams={engine.teams} />) : <p className="text-sm text-muted-foreground">Decisions and outcomes appear here.</p>}</div></section></aside></div>
}
