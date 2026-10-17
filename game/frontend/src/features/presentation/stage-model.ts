import type { GameId, TeamAssignment } from 'backend/game'
import type { PresentationState } from 'backend/presentation'
import { GAME_ORDER } from '@/lib/game-display'

export type StagePlayer = PresentationState['players'][number]
export type TeamDraft = { playerIds: string[] }[]
export function remainingPlayers(players: StagePlayer[], draft: TeamDraft) {
  const chosen = new Set(draft.flatMap(team => team.playerIds))
  return [...players].sort((a, b) => a.arrivalOrder - b.arrivalOrder).filter(player => !chosen.has(player.id))
}
export function validTeamDraft(players: StagePlayer[], draft: TeamDraft) {
  const ids = draft.flatMap(team => team.playerIds)
  return draft.length >= 2 && draft.length <= 7 && draft.every(team => team.playerIds.length >= 1 && team.playerIds.length <= 2)
    && draft.filter(team => team.playerIds.length === 1).length <= 1
    && ids.length === players.length && new Set(ids).size === ids.length
    && ids.every(id => players.some(player => player.id === id))
}
export function teamAssignments(players: StagePlayer[], draft: TeamDraft): TeamAssignment[] {
  return draft.map(team => ({ playerIds: team.playerIds, name: team.playerIds.map(id => players.find(player => player.id === id)?.name ?? '').join(' & ') }))
}
export function roundStartOperation(progress: PresentationState['progress'], game: GameId, round: number): 'startRound' | 'advance' | null {
  if (!progress || progress.status !== 'playing' || progress.publicRevealActive) return null
  if (progress.game === game && progress.round === round && progress.phase === 'ready') return 'startRound'
  if (progress.phase !== 'complete') return null
  const nextGame = progress.round === 3 ? GAME_ORDER[GAME_ORDER.indexOf(progress.game) + 1] : progress.game
  const nextRound = progress.round === 3 ? 1 : progress.round + 1
  return nextGame === game && nextRound === round ? 'advance' : null
}
export type DiscussionClock = { remainingMs: number; endsAt: number | null }
export function clockRemaining(clock: DiscussionClock, now: number) {
  return Math.max(0, clock.endsAt === null ? clock.remainingMs : Math.min(clock.remainingMs, clock.endsAt - now))
}
export function displayClock(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}
