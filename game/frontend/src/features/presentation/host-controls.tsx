import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc'
import { queryClient } from '@/lib/query-client'
import { gameNames } from '@/lib/game-display'
import { usePresentationStage } from './use-presentation-stage'
import { remainingPlayers, roundStartOperation, teamAssignments, validTeamDraft } from './stage-model'
import { useDiscussionClock } from './use-discussion-clock'
import type { PresentationSlide } from './slides'

const refresh = () => queryClient.invalidateQueries({ queryKey: ['presentation'] })
export function HostSlideControls({ slide }: { slide: PresentationSlide }) {
  const { state } = usePresentationStage()
  return <section className="presentation-host-controls" aria-label="Private slide controls"><h2 className="section-heading">Host controls <small>Only on your laptop</small></h2>
    <p className="stage-session-status">{state.isPending ? 'Connecting to active session…' : state.error ? `Connection interrupted: ${state.error.message}` : state.data ? `${state.data.sessionName}${state.data.progress ? ` · ${gameNames[state.data.progress.game]} · round ${state.data.progress.round} · ${state.data.progress.phase}` : ' · Teams not prepared'}` : 'No active session. Activate one in Sessions.'}</p>
    {state.error && <Button variant="outline" onClick={() => void state.refetch()}>Reconnect</Button>}
    {slide.id === 'make-teams' && <TeamPickControls />}
    {slide.kind === 'discussion' && slide.game && slide.round && <TimerControls game={slide.game} round={slide.round} />}
    {slide.kind === 'start' && <RoundStartControls slide={slide} />}
    {slide.id === 'final-standings' && (state.data?.progress?.game === 'bomb' && state.data.progress.round === 3 && state.data.progress.phase === 'complete' && state.data.progress.status === 'playing' ? <RoundStartControls slide={{...slide, game:'bomb', round:3}}/> : <p className="text-sm">{state.data?.progress?.status === 'finished' ? 'Advance through the ranks, then reveal the AI average.' : 'Finish all three finale rounds before revealing results.'}</p>)}
    {slide.id === 'star-trading' && <p className="text-sm">{state.data?.progress?.starTradingOpen ? 'Star trading is open in player wallets. Move to the finale instructions when ready; starting finale round 1 closes trading.' : 'Trading opens after circle round 3 completes. It closes when finale round 1 starts.'}</p>}
  </section>
}
function TeamPickControls() {
  const { state, draft, setDraft } = usePresentationStage()
  const data = state.data
  const defaults = useQuery({ queryKey: ['admin', 'game', 'defaults'], queryFn: () => trpc.admin.game.defaults.query(), enabled: Boolean(data && !data.progress) })
  const prepare = useMutation({ mutationFn: () => trpc.admin.game.start.mutate({ sessionId: data!.sessionId, teams: teamAssignments(data!.players, draft), config: defaults.data!, startingGame: 'bonus' }), onSuccess: refresh })
  if (!data) return null
  if (data.progress) return <p className="text-sm">Teams are already prepared and fixed. Use Sessions to manage the active playthrough.</p>
  const remaining = remainingPlayers(data.players, draft)
  const leader = remaining[0]
  const canPrepare = data.allArrived && validTeamDraft(data.players, draft) && Boolean(defaults.data) && !state.isError
  return <div className="space-y-4">
    {!data.allArrived && <p role="status">Mark every invited player as arrived in Sessions before preparing teams.</p>}
    {leader && <><p className="text-sm"><strong>{leader.name}</strong>{remaining.length === 1 ? ' is the solo team.' : ' chooses a teammate.'}</p>{remaining.length > 1 ? <><p className="host-partner-label">Available teammates</p><ul className="host-partner-picker" aria-label="Choose an available teammate">{remaining.slice(1).map(player => <li key={player.id}><Button variant="outline" disabled={prepare.isPending} onClick={() => setDraft([...draft, { playerIds: [leader.id, player.id] }])}>{player.name}</Button></li>)}</ul></> : <Button disabled={prepare.isPending} onClick={() => setDraft([...draft, { playerIds: [leader.id] }])}>Confirm solo team</Button>}</>}

    <div className="flex gap-3 flex-wrap"><Button variant="outline" disabled={!draft.length || prepare.isPending} onClick={() => setDraft(draft.slice(0, -1))}>Undo last team</Button><Button disabled={!canPrepare || prepare.isPending} onClick={() => prepare.mutate()}>{prepare.isPending ? 'Preparing teams…' : 'Confirm teams and prepare game'}</Button></div>
    <p className="text-xs text-muted-foreground">Picks are shared with the TV. Confirming saves every team and prepares Bonus round 1; play starts later from its round slide.</p>
    {(prepare.error || defaults.error) && <p role="alert" className="text-sm text-destructive">{prepare.error?.message ?? defaults.error?.message} Refresh the session before retrying.</p>}
  </div>
}
function TimerControls({ game, round }: { game: NonNullable<PresentationSlide['game']>; round: number }) {
  const timer = useDiscussionClock(game, round, false)
  return <div className="flex gap-3 flex-wrap"><Button variant="outline" disabled={timer.remaining === 0} onClick={timer.toggle}>{timer.running ? 'Pause timer' : 'Resume timer'}</Button><Button variant="outline" onClick={timer.reset}>Reset to 10 minutes</Button><p className="text-sm text-muted-foreground self-center">Timer is shared with the TV and survives refresh. It never starts gameplay automatically.</p></div>
}
function RoundStartControls({ slide }: { slide: PresentationSlide }) {
  const { state } = usePresentationStage()
  const data = state.data, p = data?.progress
  const operation = slide.game && slide.round ? roundStartOperation(p ?? null, slide.game, slide.round) : null
  const finish = p?.game === 'bomb' && p.round === 3 && p.phase === 'complete' && p.status === 'playing' && slide.game === 'bomb' && slide.round === 3 && !p.publicRevealActive
  const command = useMutation({ mutationFn: (input: { sessionId: string; operation: 'startRound' | 'advance'; control: { requestId: string; expectedRevision: number } }) => trpc.admin.game[input.operation].mutate({ sessionId: input.sessionId, control: input.control }), onSuccess: refresh })
  const sameRound = Boolean(p && p.game === slide.game && p.round === slide.round)
  const inProgress = sameRound && p?.status === 'playing' && !['ready','complete'].includes(p.phase)
  return <div className="space-y-3"><Button className="min-h-12" disabled={(!operation && !finish) || command.isPending || state.isError || command.isError} onClick={() => command.mutate({ sessionId: data!.sessionId, operation: finish ? 'advance' : operation!, control: { requestId: crypto.randomUUID(), expectedRevision: p!.revision } })}>{command.isPending ? 'Starting…' : finish ? 'Finish game night' : `Start round ${slide.round}`}</Button>
    <p className="text-sm text-muted-foreground">{p?.publicRevealActive ? 'Waiting for all teams to acknowledge the public reveal.' : p?.status === 'finished' ? 'Game night is finished.' : inProgress ? 'Round is in play. Wait for all team choices.' : sameRound && p?.phase === 'complete' ? 'Round complete. Continue to the next discussion.' : !operation && !finish ? 'Finish the preceding round before starting this one.' : 'This starts the matching round in the active session.'}</p>
    {command.error && <div role="alert" className="space-y-2 text-sm"><p>{command.error.message}</p><Button variant="outline" disabled={command.isPending} onClick={() => { if (command.variables) command.mutate(command.variables) }}>Retry same command</Button><Button variant="outline" onClick={() => { command.reset(); void state.refetch() }}>Refresh current state</Button></div>}
  </div>
}
