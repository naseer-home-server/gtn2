import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import express from 'express'
import { TRPCError } from '@trpc/server'
import { getHTTPStatusCodeFromError } from '@trpc/server/http'
import { z } from 'zod'
import type { AppDb } from './db/index.js'
import { gameSessions, sessionEvents, sessionPlayers } from './db/schema.js'
import { DEFAULT_CONFIG, gameConfigSchema, playerCommandSchema } from './engine/config.js'
import { DbGameplayRepository } from './gameplay.js'
import type { DbGameSessionsRepository } from './game-sessions.js'
import type { DbChatsRepository } from './chats.js'

type SimulationMeta = Record<string, unknown> & {
  owner: 'simulation'; setupRequestId: string; setupSignature: string; seed: string
  logicalTime: number; randomState: number
  credentialHashes: Record<string, string>; assignments: { name: string; playerIds: string[] }[]
  playerAgents: Record<string, string>; config: z.infer<typeof gameConfigSchema>
}

const setupSchema = z.object({ requestId: z.uuid(), name: z.string().trim().min(1).max(80), teamCount: z.number().int().min(2).max(5),
  seed: z.union([z.string().min(1).max(200), z.number().int().safe()]), config: gameConfigSchema.optional() })
const controlSchema = z.object({ requestId: z.uuid(), operation: z.enum(['start', 'advance', 'prepare', 'tick']), expectedToken: z.string().min(1).max(100).optional() })
const jsonError = (response: express.Response, error: unknown) => {
  const failure = error instanceof TRPCError ? error : error instanceof z.ZodError
    ? new TRPCError({ code: 'BAD_REQUEST', message: error.message })
    : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unable to process the simulation request.' })
  response.status(getHTTPStatusCodeFromError(failure)).json({ error: failure.message, code: failure.code })
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
}
const seedState = (seed: string) => Number.parseInt(hash(seed).slice(0, 8), 16) >>> 0 || 1
function shuffle<T>(items: T[], seed: string): T[] {
  let state = seedState(seed)
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 0x1_0000_0000 }
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1)); [result[index], result[target]] = [result[target]!, result[index]!]
  }
  return result
}

export class SimulationBridge {
  private readonly secret: string | null
  constructor(private readonly db: AppDb, private readonly sessions: DbGameSessionsRepository,
    private readonly gameplay: DbGameplayRepository, private readonly chats: DbChatsRepository,
    secret = process.env.SIMULATION_SERVICE_KEY ?? '') {
    this.secret = secret.length >= 32 ? secret : null
  }

  mount(app: express.Express) {
    if (!this.secret) return
    const router = express.Router()
    router.use(express.json({ limit: '128kb' }))
    router.use((request, response, next) => {
      response.setHeader('Cache-Control', 'no-store')
      const provided = request.get('x-simulation-service-key') ?? ''
      const expected = this.secret!
      if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
        response.status(401).json({ error: 'Simulation service authentication required.', code: 'UNAUTHORIZED' }); return
      }
      next()
    })
    router.post('/sessions', async (request, response) => {
      try { response.status(201).json(await this.create(setupSchema.parse(request.body))) } catch (error) { jsonError(response, error) }
    })
    router.get('/sessions/:sessionId', async (request, response) => {
      try {
        const view = await this.gameplay.adminView(request.params.sessionId!)
        const meta = await this.metadata(request.params.sessionId!)
        response.json({ sessionId: view.sessionId, sessionName: view.sessionName, status: view.state?.status ?? 'ready',
          revision: view.state?.revision ?? 0, logicalTime: meta.logicalTime, state: view.state, events: view.events })
      } catch (error) { jsonError(response, error) }
    })
    router.post('/sessions/:sessionId/control', async (request, response) => {
      try {
        const body = controlSchema.parse(request.body)
        const result = await this.gameplay.simulationControl(request.params.sessionId!, body.requestId, body.operation, body.expectedToken)
        const view = await this.gameplay.adminView(request.params.sessionId!)
        response.json({ ...result, status: result.state?.status ?? 'ready', events: view.events })
      }
      catch (error) { jsonError(response, error) }
    })
    router.use('/sessions/:sessionId/players/:agentId', async (request, response, next) => {
      try {
        const capability = (request.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
        if (!capability) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Player capability required.' })
        const meta = await this.metadata(request.params.sessionId!)
        const players = await this.db.select().from(sessionPlayers).where(eq(sessionPlayers.sessionId, request.params.sessionId!))
        const player = players.find((candidate) => {
          const digest = meta.credentialHashes?.[candidate.id]
          if (typeof digest !== 'string') return false
          const actual = Buffer.from(hash(capability), 'hex'); const expected = Buffer.from(digest, 'hex')
          return actual.length === expected.length && timingSafeEqual(actual, expected)
        })
        if (!player) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid player capability.' })
        const assignments = meta.assignments ?? []
        const teamIndex = assignments.findIndex((team) => team.playerIds.includes(player.id))
        const agentId = `team-${teamIndex + 1}`
        if (teamIndex < 0 || request.params.agentId !== agentId || !meta.playerAgents || (meta.playerAgents as Record<string, string>)[agentId] !== player.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'This capability is not scoped to that agent.' })
        }
        response.locals.simPlayer = { player, agentId }
        next()
      } catch (error) { jsonError(response, error) }
    })
    router.get('/sessions/:sessionId/players/:agentId/state', async (request, response) => {
      try { const player = response.locals.simPlayer.player as typeof sessionPlayers.$inferSelect; response.json(await this.gameplay.playerView(player.email)) }
      catch (error) { jsonError(response, error) }
    })
    router.post('/sessions/:sessionId/players/:agentId/actions', async (request, response) => {
      try {
        const player = response.locals.simPlayer.player as typeof sessionPlayers.$inferSelect
        const command = playerCommandSchema.parse(request.body)
        response.json(await this.gameplay.action(player.email, command, `simulation:${player.id}`))
      } catch (error) { jsonError(response, error) }
    })
    router.get('/sessions/:sessionId/players/:agentId/chat/inbox', async (request, response) => {
      try { const player = response.locals.simPlayer.player as typeof sessionPlayers.$inferSelect; response.json(await this.chats.inbox(player.email)) }
      catch (error) { jsonError(response, error) }
    })
    router.post('/sessions/:sessionId/players/:agentId/chat/direct', async (request, response) => {
      try { const player = response.locals.simPlayer.player as typeof sessionPlayers.$inferSelect; const body = z.object({ teamId: z.uuid() }).parse(request.body); response.json(await this.chats.direct(player.email, body.teamId)) }
      catch (error) { jsonError(response, error) }
    })
    router.post('/sessions/:sessionId/players/:agentId/chat/groups', async (request, response) => {
      try { const player = response.locals.simPlayer.player as typeof sessionPlayers.$inferSelect; const body = z.object({ name: z.string().min(1).max(60), playerIds: z.array(z.uuid()).min(2).max(9) }).parse(request.body); response.json(await this.chats.createGroup(player.email, body.name, body.playerIds)) }
      catch (error) { jsonError(response, error) }
    })
    router.post('/sessions/:sessionId/players/:agentId/chat/messages', async (request, response) => {
      try { const player = response.locals.simPlayer.player as typeof sessionPlayers.$inferSelect; const body = z.object({ conversationId: z.uuid(), beforeSequence: z.number().int().positive().optional() }).parse(request.body); response.json(await this.chats.messages(player.email, body.conversationId, body.beforeSequence)) }
      catch (error) { jsonError(response, error) }
    })
    router.get('/sessions/:sessionId/players/:agentId/chat/messages', async (request, response) => {
      try { const player = response.locals.simPlayer.player as typeof sessionPlayers.$inferSelect; const body = z.object({ conversationId: z.uuid(), beforeSequence: z.coerce.number().int().positive().optional() }).parse(request.query); response.json(await this.chats.messages(player.email, body.conversationId, body.beforeSequence)) }
      catch (error) { jsonError(response, error) }
    })
    router.post('/sessions/:sessionId/players/:agentId/chat/send', async (request, response) => {
      try { const player = response.locals.simPlayer.player as typeof sessionPlayers.$inferSelect; const body = z.object({ conversationId: z.uuid(), text: z.string().min(1).max(2000), clientMessageId: z.string().min(1).max(128) }).parse(request.body); response.json(await this.chats.send(player.email, body.conversationId, body.text, body.clientMessageId)) }
      catch (error) { jsonError(response, error) }
    })
    app.use('/api/simulation', router)
  }

  private async metadata(sessionId: string): Promise<SimulationMeta> {
    const [row] = await this.db.select({ simulation: gameSessions.simulation }).from(gameSessions).where(eq(gameSessions.id, sessionId))
    const meta = row?.simulation as SimulationMeta | null | undefined
    if (!meta || meta.owner !== 'simulation') throw new TRPCError({ code: 'NOT_FOUND', message: 'Simulation session not found.' })
    return meta
  }

  private credential(sessionId: string, playerId: string) {
    return createHmac('sha256', this.secret!).update(`simulation-player:${sessionId}:${playerId}`).digest('base64url')
  }

  private async create(input: z.infer<typeof setupSchema>) {
    const config = input.config ?? DEFAULT_CONFIG
    const seed = String(input.seed)
    const signature = hash(canonical({ name: input.name, teamCount: input.teamCount, seed, config }))
    const [row] = await this.db.select().from(gameSessions).where(sql`${gameSessions.simulation}->>'setupRequestId' = ${input.requestId}`).limit(1)
    if (row) {
      const meta = row.simulation as SimulationMeta
      if (meta.setupSignature !== signature) throw new TRPCError({ code: 'CONFLICT', message: 'This setup request ID was already used with different settings.' })
      return this.finishSetup(row.id, meta)
    }
    const playerCount = input.teamCount * 2
    const newSessionId = randomUUID()
    let raw: { id: string; meta: SimulationMeta }
    try {
      raw = await this.db.transaction(async (tx) => {
      const [created] = await tx.insert(gameSessions).values({ id: newSessionId, name: input.name, createdBy: 'simulation:runner', simulation: {
        owner: 'simulation', setupRequestId: input.requestId, setupSignature: signature, seed,
        logicalTime: 1_000_000, randomState: seedState(`${seed}:game`), credentialHashes: {}, assignments: [], playerAgents: {}, config,
      } }).returning()
      const draftIds = Array.from({ length: playerCount }, (_, index) => index)
      const pairings = shuffle(draftIds, `${seed}:pairings`)
      const arrivalOrder = shuffle(draftIds, `${seed}:arrivals`)
      const players = await tx.insert(sessionPlayers).values(draftIds.map((index) => ({ sessionId: created.id, email: `sim-${created.id}-${index + 1}@simulation.invalid`, arrivalOrder: arrivalOrder.indexOf(index) + 1 }))).returning()
      const playerByDraftId = new Map(players.map((player, index) => [draftIds[index]!, player]))
      const teamPlayers = Array.from({ length: input.teamCount }, (_value, index) => pairings.slice(index * 2, index * 2 + 2)
        .map((draftId) => playerByDraftId.get(draftId)!).sort((a, b) => a.arrivalOrder! - b.arrivalOrder!))
      const assignments = shuffle(teamPlayers, `${seed}:team-order`).map((members, index) => ({ name: `Team ${index + 1}`, playerIds: members.map(({ id }) => id) }))
      const playerAgents = Object.fromEntries(assignments.map((team, index) => [`team-${index + 1}`, team.playerIds[0]!]))
      const credentialHashes = Object.fromEntries(players.map((player) => [player.id, hash(this.credential(created.id, player.id))]))
      const meta: SimulationMeta = { ...(created.simulation as SimulationMeta), assignments, playerAgents, credentialHashes }
      await tx.update(gameSessions).set({ simulation: meta }).where(eq(gameSessions.id, created.id))
      await tx.insert(sessionEvents).values({ sessionId: created.id, actorId: 'simulation:runner', type: 'simulation.created', data: { requestId: input.requestId, teamCount: input.teamCount } })
      return { id: created.id, meta }
      })
    } catch (error) {
      const [concurrent] = await this.db.select().from(gameSessions).where(sql`${gameSessions.simulation}->>'setupRequestId' = ${input.requestId}`).limit(1)
      if (!concurrent) throw error
      const concurrentMeta = concurrent.simulation as SimulationMeta
      if (concurrentMeta.setupSignature !== signature) throw new TRPCError({ code: 'CONFLICT', message: 'This setup request ID was already used with different settings.' })
      return this.finishSetup(concurrent.id, concurrentMeta)
    }
    return this.finishSetup(raw.id, raw.meta)
  }

  private async finishSetup(sessionId: string, meta: SimulationMeta) {
    const allPlayers = await this.db.select().from(sessionPlayers).where(eq(sessionPlayers.sessionId, sessionId))
    for (const player of allPlayers) await this.sessions.arrive(sessionId, player.id, 'simulation:runner')
    let [session] = await this.db.select().from(gameSessions).where(eq(gameSessions.id, sessionId))
    if (!Object.keys(session.state).length) {
      try { await this.gameplay.start(sessionId, meta.assignments, meta.config, 'simulation:runner') }
      catch (error) {
        const [afterConcurrentStart] = await this.db.select().from(gameSessions).where(eq(gameSessions.id, sessionId))
        if (!Object.keys(afterConcurrentStart.state).length) throw error
      }
    }
    ;[session] = await this.db.select().from(gameSessions).where(eq(gameSessions.id, sessionId))
    await this.sessions.setActive(sessionId, 'simulation:runner')
    const players = allPlayers.flatMap((player) => {
      const teamIndex = meta.assignments.findIndex((team) => team.playerIds.includes(player.id))
      if (teamIndex < 0 || meta.playerAgents[`team-${teamIndex + 1}`] !== player.id) return []
      return [{ agentId: `team-${teamIndex + 1}`, name: meta.assignments[teamIndex]!.name, teamId: (session.state as { teams?: { id: string; playerIds: string[] }[] }).teams?.find((team) => team.playerIds.includes(player.id))?.id ?? '',
        playerId: player.id, email: player.email, credential: this.credential(sessionId, player.id) }]
    })
    return { sessionId, players }
  }
}
