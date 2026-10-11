import { and, asc, desc, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import type { AppDb } from './db/index.js'
import { appSettings, gameSessions, sessionEvents, sessionPlayers } from './db/schema.js'
import type { GameSession, GameSessionsRepository } from './session-types.js'

const missing = () => new TRPCError({ code: 'NOT_FOUND', message: 'Game session not found.' })
export class DbGameSessionsRepository implements GameSessionsRepository {
  constructor(private readonly db: AppDb) {}

  async list(): Promise<GameSession[]> {
    const rows = await this.db.select().from(gameSessions).orderBy(desc(gameSessions.createdAt))
    const [settings] = await this.db.select().from(appSettings).where(eq(appSettings.id, 'global'))
    const players = await this.db.select().from(sessionPlayers).orderBy(asc(sessionPlayers.arrivalOrder), asc(sessionPlayers.email))
    return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.createdAt.toISOString(),
      isActive: settings?.activeGameSessionId === row.id, currentGame: row.currentGame, currentRound: row.currentRound,
      players: players.filter((p) => p.sessionId === row.id).map(({ id, email, arrivalOrder }) => ({ id, email, arrivalOrder })) }))
  }
  async get(id: string): Promise<GameSession> {
    const [row] = await this.db.select().from(gameSessions).where(eq(gameSessions.id, id))
    if (!row) throw missing()
    const [settings] = await this.db.select().from(appSettings).where(eq(appSettings.id, 'global'))
    const players = await this.db.select({ id: sessionPlayers.id, email: sessionPlayers.email, arrivalOrder: sessionPlayers.arrivalOrder })
      .from(sessionPlayers).where(eq(sessionPlayers.sessionId, id)).orderBy(asc(sessionPlayers.arrivalOrder), asc(sessionPlayers.email))
    return { id, name: row.name, createdAt: row.createdAt.toISOString(), isActive: settings?.activeGameSessionId === id,
      currentGame: row.currentGame, currentRound: row.currentRound, players }
  }
  async create(name: string, emails: string[], actorId: string) {
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx.insert(gameSessions).values({ name, createdBy: actorId }).returning()
      await tx.insert(sessionPlayers).values(emails.map((email) => ({ sessionId: row.id, email })))
      await tx.insert(sessionEvents).values({ sessionId: row.id, actorId, type: 'session.created', data: { emails } })
      return row.id
    })
    return this.get(id)
  }
  async setActive(id: string | null, actorId: string) {
    await this.db.transaction(async (tx) => {
      const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, 'global')).for('update')
      if (!settings) throw new Error('Global settings are missing')
      if (id) {
        const [session] = await tx.select().from(gameSessions).where(eq(gameSessions.id, id))
        if (!session) throw missing()
      }
      if (settings.activeGameSessionId === id) return
      await tx.update(appSettings).set({ activeGameSessionId: id, updatedAt: new Date() }).where(eq(appSettings.id, 'global'))
      if (settings.activeGameSessionId) await tx.insert(sessionEvents).values({ sessionId: settings.activeGameSessionId, actorId, type: 'session.deactivated', data: {} })
      if (id) await tx.insert(sessionEvents).values({ sessionId: id, actorId, type: 'session.activated', data: {} })
    })
  }
  async arrive(sessionId: string, playerId: string, actorId: string) {
    await this.db.transaction(async (tx) => {
      const [session] = await tx.select().from(gameSessions).where(eq(gameSessions.id, sessionId)).for('update')
      if (!session) throw missing()
      const players = await tx.select().from(sessionPlayers).where(eq(sessionPlayers.sessionId, sessionId))
      const player = players.find((p) => p.id === playerId)
      if (!player) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Player is not invited to this session.' })
      if (player.arrivalOrder !== null) return
      const arrivalOrder = players.filter((p) => p.arrivalOrder !== null).length + 1
      await tx.update(sessionPlayers).set({ arrivalOrder }).where(eq(sessionPlayers.id, playerId))
      await tx.insert(sessionEvents).values({ sessionId, actorId, type: 'player.arrived', data: { playerId, arrivalOrder } })
    })
  }
  async reorder(sessionId: string, playerIds: string[], actorId: string) {
    await this.db.transaction(async (tx) => {
      const [session] = await tx.select().from(gameSessions).where(eq(gameSessions.id, sessionId)).for('update')
      if (!session) throw missing()
      const players = await tx.select().from(sessionPlayers).where(eq(sessionPlayers.sessionId, sessionId))
      const arrived = players.filter((p) => p.arrivalOrder !== null)
      if (new Set(playerIds).size !== playerIds.length || playerIds.length !== arrived.length || arrived.some((p) => !playerIds.includes(p.id))) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Include every arrived player exactly once.' })
      }
      // Clear ranks inside the transaction to avoid unique-index conflicts when swapping.
      await tx.update(sessionPlayers).set({ arrivalOrder: null }).where(eq(sessionPlayers.sessionId, sessionId))
      for (const [index, id] of playerIds.entries()) await tx.update(sessionPlayers).set({ arrivalOrder: index + 1 }).where(eq(sessionPlayers.id, id))
      await tx.insert(sessionEvents).values({ sessionId, actorId, type: 'players.reordered', data: { playerIds } })
    })
  }
  async membership(email: string) {
    const [row] = await this.db.select({ sessionId: gameSessions.id, sessionName: gameSessions.name, playerId: sessionPlayers.id })
      .from(appSettings).innerJoin(gameSessions, eq(appSettings.activeGameSessionId, gameSessions.id))
      .innerJoin(sessionPlayers, and(eq(sessionPlayers.sessionId, gameSessions.id), eq(sessionPlayers.email, email.trim().toLowerCase())))
      .where(eq(appSettings.id, 'global')).limit(1)
    return row ?? null
  }
}
