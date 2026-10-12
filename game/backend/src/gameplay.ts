import { createHash, randomInt, randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { ZodError } from 'zod'
import { GameRuleError } from './engine/errors.js'
import type { AppDb } from './db/index.js'
import { appSettings, gameSessions, sessionEvents, sessionPlayers } from './db/schema.js'
import { advanceEngine, applyAction, resetCurrentGame, startEngine, tickEngine } from './engine/index.js'
import { playerView } from './engine/views.js'
import { ensure } from './engine/helpers.js'
import type { AdminGameView, EngineEnv, EngineEvent, EngineState, GameConfig, GameId, GameplayRepository, PlayerCommand, TeamAssignment } from './engine/types.js'

type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0]
type SessionRow = typeof gameSessions.$inferSelect
const environment = (): EngineEnv => ({ now: Date.now(), random: () => randomInt(0, 2 ** 32) / 2 ** 32, token: randomUUID })
function readState(row: SessionRow): EngineState | null {
  if (!Object.keys(row.state).length) return null
  if (row.state.version !== 1) throw new Error('Unsupported game state version.')
  return structuredClone(row.state) as unknown as EngineState
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
}
function signature(command: PlayerCommand) { return createHash('sha256').update(canonical({ token: command.token, action: command.action })).digest('hex') }
async function lockedSession(tx: Tx, id: string): Promise<SessionRow> {
  const [row] = await tx.select().from(gameSessions).where(eq(gameSessions.id, id)).for('update')
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game session not found.' })
  return row
}
async function activeParticipant(tx: Tx, email: string) {
  const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, 'global')).for('share')
  if (!settings?.activeGameSessionId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No game session is active.' })
  const row = await lockedSession(tx, settings.activeGameSessionId)
  const [player] = await tx.select().from(sessionPlayers).where(and(eq(sessionPlayers.sessionId, row.id), eq(sessionPlayers.email, email.trim().toLowerCase())))
  if (!player) throw new TRPCError({ code: 'FORBIDDEN', message: 'Your email is not invited to the active session.' })
  return { row, player }
}
async function persist(tx: Tx, sessionId: string, state: EngineState, events: EngineEvent[], actorId: string) {
  state.revision += 1
  await tx.update(gameSessions).set({ state: state as unknown as Record<string, unknown>, currentGame: state.current.game, currentRound: state.round }).where(eq(gameSessions.id, sessionId))
  if (events.length) await tx.insert(sessionEvents).values(events.map((event, index) => ({
    sessionId, actorId, type: event.type, data: { ...event.data, revision: state.revision, eventIndex: index },
  })))
}
function gameError(error: unknown): never {
  if (error instanceof TRPCError) throw error
  if (error instanceof GameRuleError || error instanceof ZodError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unable to process the game request.', cause: error })
}

export class DbGameplayRepository implements GameplayRepository {
  constructor(private readonly db: AppDb, private readonly env: () => EngineEnv = environment) {}

  async adminView(sessionId: string): Promise<AdminGameView> {
    const [row] = await this.db.select().from(gameSessions).where(eq(gameSessions.id, sessionId))
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game session not found.' })
    const events = await this.db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, sessionId)).orderBy(asc(sessionEvents.sequence))
    return { sessionId: row.id, sessionName: row.name, state: readState(row), events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })) }
  }
  async playerView(email: string) {
    return this.db.transaction(async (tx) => {
      const { row, player } = await activeParticipant(tx, email)
      return playerView(row.id, row.name, readState(row), player.id)
    })
  }
  async start(sessionId: string, assignments: TeamAssignment[], config: GameConfig, actorId: string, startingGame: GameId = 'bonus') {
    try {
      await this.db.transaction(async (tx) => {
        const row = await lockedSession(tx, sessionId)
        ensure(!readState(row), 'This playthrough has already started.')
        ensure(assignments.length >= 2 && assignments.length <= 5, 'Create between two and five teams.')
        const players = await tx.select().from(sessionPlayers).where(eq(sessionPlayers.sessionId, sessionId))
        const ids = assignments.flatMap((team) => team.playerIds)
        ensure(new Set(ids).size === ids.length, 'Each person can belong to only one team.')
        ensure(assignments.every((team) => team.playerIds.length >= 1 && team.playerIds.length <= 2), 'Teams contain one or two people.')
        ensure(assignments.filter((team) => team.playerIds.length === 1).length <= 1, 'Only one solo team is allowed.')
        ensure(new Set(assignments.map((team) => team.name.trim().toLowerCase())).size === assignments.length, 'Team names must be unique.')
        const teams = assignments.map((assignment) => {
          const members = assignment.playerIds.map((id) => players.find((player) => player.id === id))
          ensure(members.every((member) => member && member.arrivalOrder !== null), 'All assigned players must be invited and marked arrived.')
          const leader = [...members].sort((a, b) => a!.arrivalOrder! - b!.arrivalOrder!)[0]!
          return { id: randomUUID(), name: assignment.name.trim(), playerIds: assignment.playerIds, leaderPlayerId: leader.id, tieOrder: leader.arrivalOrder!, balance: '0', stars: 0 }
        })
        const { state, events } = startEngine(teams, config, this.env(), startingGame)
        await persist(tx, sessionId, state, events, actorId)
      })
    } catch (error) { gameError(error) }
  }
  async advance(sessionId: string, actorId: string) {
    try {
      await this.db.transaction(async (tx) => {
        const row = await lockedSession(tx, sessionId); const state = readState(row)
        ensure(state, 'Start the playthrough first.')
        await persist(tx, sessionId, state, advanceEngine(state, this.env()), actorId)
      })
    } catch (error) { gameError(error) }
  }
  async reset(sessionId: string, actorId: string) {
    try {
      await this.db.transaction(async (tx) => {
        const row = await lockedSession(tx, sessionId); const state = readState(row)
        ensure(state, 'Start the playthrough first.')
        await persist(tx, sessionId, state, resetCurrentGame(state, this.env()), actorId)
      })
    } catch (error) { gameError(error) }
  }
  async action(email: string, command: PlayerCommand, actorId: string) {
    try {
      return await this.db.transaction(async (tx) => {
        const { row, player } = await activeParticipant(tx, email); const state = readState(row)
        ensure(state, 'The host has not started this playthrough.')
        const team = state.teams.find((item) => item.playerIds.includes(player.id))
        ensure(team, 'The host has not assigned you to a team.')
        ensure((team.leaderPlayerId ?? team.playerIds[0]) === player.id, 'Only your team leader can submit decisions. Discuss your choice with them in person.')
        const [previous] = await tx.select().from(sessionEvents).where(and(eq(sessionEvents.sessionId, row.id), eq(sessionEvents.type, 'player.command'), sql`${sessionEvents.data}->>'requestId' = ${command.requestId}`)).limit(1)
        if (previous) {
          ensure(previous.data.teamId === team.id && previous.data.signature === signature(command), 'This request ID was already used for a different action.')
          return playerView(row.id, row.name, state, player.id)
        }
        const events = applyAction(state, team.id, command.token, command.action, this.env())
        await persist(tx, row.id, state, [{ type: 'player.command', data: { playerId: player.id, teamId: team.id, requestId: command.requestId, signature: signature(command), token: command.token, action: command.action } }, ...events], actorId)
        return playerView(row.id, row.name, state, player.id)
      })
    } catch (error) { gameError(error) }
  }
  async tick() {
    await this.db.transaction(async (tx) => {
      const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, 'global')).for('share')
      if (!settings?.activeGameSessionId) return
      const row = await lockedSession(tx, settings.activeGameSessionId); const state = readState(row)
      if (!state) return
      const events = tickEngine(state, this.env())
      if (events.length) await persist(tx, row.id, state, events, 'system:timer')
    })
  }
}
