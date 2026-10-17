import type { GameConfig, GameId, GameplayRepository } from './engine/types.js'
import { isStarTransferOpen, rankings } from './engine/index.js'
import { units } from './engine/money.js'
import { DEFAULT_CONFIG } from './engine/config.js'
import type { GameSessionsRepository, GameSession } from './session-types.js'

function displayName(player: GameSession['players'][number]) {
  // Presentation never falls back to an email address.
  return player.name?.trim() || player.firstName?.trim() || `Player ${player.arrivalOrder ?? '—'}`
}

/** Only intentionally public stage data crosses this boundary; never return engine state/audit. */
export async function presentationState(sessions: GameSessionsRepository, gameplay: GameplayRepository, selectedGame?: GameId, includeTeamEmails = false, includeFinalStandings = false) {
  const session = (await sessions.list()).find(item => item.isActive)
  if (!session) return null
  const { state } = await gameplay.adminView(session.id)
  const config: GameConfig = structuredClone(state?.config ?? DEFAULT_CONFIG)
  // The star advantage is introduced on the finale instructions, never on earlier slides.
  if (selectedGame !== 'bomb') config.bomb.advantageChits = config.bomb.maxChits
  const players = session.players.filter(player => player.arrivalOrder !== null)
    .sort((a, b) => a.arrivalOrder! - b.arrivalOrder!)
    .map(player => ({ id: player.id, name: displayName(player), arrivalOrder: player.arrivalOrder!, ...(includeTeamEmails ? { email: player.email } : {}) }))
  return {
    sessionId: session.id, sessionName: session.name, players,
    allArrived: players.length === session.players.length,
    teams: [...(state?.teams ?? [])].sort((a, b) => a.tieOrder - b.tieOrder)
      .map(team => ({ id: team.id, name: team.name, playerIds: [...team.playerIds], tieOrder: team.tieOrder, stars: team.stars })),
    config,
    ...(includeFinalStandings && state?.status === 'finished' ? {
      finalStandings: {
        entries: rankings(state).map(({teamId, rank}) => {
          const team = state.teams.find(item => item.id === teamId)!
          return {teamId, rank, name:team.name, earnings:units(team.balance)}
        }),
        modelAverage: '1822.00',
      },
    } : {}),
    cave: state?.current.game === 'cave' && state.current.phase === 'cave' ? {
      tick: state.current.tick, maxTicks: config.cave.maxTicks ?? 10,
      unbanked: units(state.current.unbanked),
      nextTickAt: state.reveal ? null : state.current.nextTickAt,
    } : null,
    progress: state ? {
      game: state.current.game, round: state.round, phase: state.current.phase,
      status: state.status, revision: state.revision, publicRevealActive: Boolean(state.reveal),
      starTradingOpen: isStarTransferOpen(state),
    } : null,
  }
}
export type PresentationState = NonNullable<Awaited<ReturnType<typeof presentationState>>>
