import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { eq, inArray, sql } from 'drizzle-orm'
import type { AppDb } from './db/index.js'
import { initDb, closeDb } from './db/index.js'
import { appSettings, gameSessions, sessionEvents, sessionPlayers } from './db/schema.js'
import { DEFAULT_CONFIG } from './engine/config.js'
import { advanceEngine, applyAction, resetCurrentGame, startEngine, startRoundEngine, tickEngine } from './engine/index.js'
import { GAME_ORDER, type EngineEnv, type EngineEvent, type EngineState, type GameId } from './engine/types.js'

const ownerPrefix = 'local-seed:v1:'
type Fixture = { key: string; name: string; emails: string[]; teams: { name: string; indexes: number[] }[]; game: GameId; preview: boolean }
const displayNames: Record<GameId, string> = { bonus: 'Will We Get a Bonus This Year?', 'high-low': 'High or Low', cave: 'Cave Mining', circle: 'What Goes Around Comes Around', bomb: 'Gamble Bomb' }
const fixtures: Fixture[] = [
  { key: 'e2e', name: 'E2E Playthrough', emails: Array.from({ length: 10 }, (_, i) => `e2e-player-${String(i + 1).padStart(2, '0')}@test.com`), teams: Array.from({ length: 5 }, (_, i) => ({ name: `E2E Team ${i + 1}`, indexes: [i * 2, i * 2 + 1] })), game: 'bonus', preview: false },
  ...GAME_ORDER.map((game) => ({ key: `preview-${game}`, name: `UX Preview ${displayNames[game]}`, emails: [`ux-${game}-leader@test.com`, `ux-${game}-partner@test.com`, `ux-${game}-solo@test.com`], teams: [{ name: 'Pair', indexes: [0, 1] }, { name: 'Solo', indexes: [2] }], game, preview: true })),
]
const keyFor = (fixture: Fixture) => `${ownerPrefix}${fixture.key}`
const configFor = (preview: boolean) => ({ ...structuredClone(DEFAULT_CONFIG), initialBalance: preview ? 100 : DEFAULT_CONFIG.initialBalance })
export type SeedTransaction = Parameters<Parameters<AppDb['transaction']>[0]>[0]

function engineEnvironment(): EngineEnv {
  return { now: 1_800_000_000_000, random: () => 0.5, token: randomUUID }
}

/** Simulate preceding games with the shared engine, then leave the target at ready round 1. */
function prepareCheckpoint(state: EngineState, target: GameId, env: EngineEnv): EngineEvent[] {
  const events: EngineEvent[] = []
  const index = GAME_ORDER.indexOf(target)
  for (let gameIndex = 0; gameIndex < index; gameIndex++) {
    for (let round = 1; round <= 3; round++) {
      if (state.current.phase === 'ready') events.push(...startRoundEngine(state, env))
      const game = state.current.game
      if (game === 'bonus') {
        for (const [i, team] of state.teams.entries()) events.push(...applyAction(state, team.id, state.current.token, { type: 'bonus.take', amount: i === 0 ? 20 : 5 }, env))
      } else if (game === 'high-low') {
        for (const [i, team] of state.teams.entries()) events.push(...applyAction(state, team.id, state.current.token, { type: 'high-low.choose', amount: i === 0 ? 10 : 20 }, env))
      } else if (game === 'cave') {
        // Bank the safe opening amount for both teams. This avoids waiting on the live cave timer.
        for (const team of [...state.teams]) events.push(...applyAction(state, team.id, state.current.token, { type: 'cave.decide', decision: 'leave' }, env))
        events.push(...tickEngine(state, { ...env, now: env.now + 100_000 }))
      } else if (game === 'circle') {
        for (const team of state.teams) events.push(...applyAction(state, team.id, state.current.token, { type: 'circle.send', money: 0, stars: team.stars }, env))
        for (const team of state.teams) events.push(...applyAction(state, team.id, state.current.token, { type: 'circle.return', money: 0, stars: 0 }, env))
      }
      if (round < 3) {
        try { events.push(...advanceEngine(state, env)) }
        catch (error) { throw new Error(`Seed simulation failed at ${game} round ${round} (${state.current.phase}).`, { cause: error }) }
      }
    }
    // The advance starts the next game; reset it back to a ready round-one checkpoint.
    events.push(...advanceEngine(state, env))
    events.push(...resetCurrentGame(state, env))
  }
  return events
}

async function createFixture(tx: SeedTransaction, fixture: Fixture) {
  const owner = keyFor(fixture)
  const [session] = await tx.insert(gameSessions).values({ name: fixture.name, createdBy: owner }).returning()
  // Set arrival order from the fixture list explicitly; it determines team leaders and tie order.
  const people = await tx.insert(sessionPlayers).values(fixture.emails.map((email, index) => ({ sessionId: session.id, email, arrivalOrder: index + 1 }))).returning()
  const teams = fixture.teams.map((item) => {
    const members = item.indexes.map((i) => people.find((p) => p.email === fixture.emails[i])!)
    return { id: randomUUID(), name: item.name, playerIds: members.map((p) => p.id), leaderPlayerId: members[0].id, tieOrder: members[0].arrivalOrder!, balance: '0', stars: 0 }
  })
  const env = engineEnvironment()
  const { state, events } = startEngine(teams, configFor(fixture.preview), env, 'bonus')
  const historyEvents = fixture.game === 'bonus' ? [] : prepareCheckpoint(state, fixture.game, env)
  state.revision = 1
  await tx.update(gameSessions).set({ state: state as unknown as Record<string, unknown>, currentGame: state.current.game, currentRound: state.round }).where(eq(gameSessions.id, session.id))
  await tx.insert(sessionEvents).values([
    { sessionId: session.id, actorId: owner, type: 'session.created', data: { emails: fixture.emails } },
    ...people.map((person) => ({ sessionId: session.id, actorId: owner, type: 'player.arrived', data: { playerId: person.id, arrivalOrder: person.arrivalOrder! } })),
    ...events.concat(historyEvents).map((event, eventIndex) => ({ sessionId: session.id, actorId: owner, type: event.type, data: { ...event.data, revision: 1, eventIndex } })),
  ])
  return session
}

export async function seedLocalTestDataInTransaction(tx: SeedTransaction, reset = false) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('gtn2-local-test-seed-v1'))`)
    await tx.insert(appSettings).values({ id: 'global' }).onConflictDoNothing()
    const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, 'global')).for('update')
    const priorActiveId = settings.activeGameSessionId
    const owned = await tx.select({ id: gameSessions.id, createdBy: gameSessions.createdBy }).from(gameSessions).where(sql`${gameSessions.createdBy} like ${`${ownerPrefix}%`}`)
    const activeOwner = owned.find((item) => item.id === priorActiveId)?.createdBy ?? null
    await tx.update(appSettings).set({ emailLoginEnabled: true, updatedAt: new Date() }).where(eq(appSettings.id, 'global'))
    if (reset && owned.length) {
      const ids = owned.map((item) => item.id)
      if (priorActiveId && ids.includes(priorActiveId)) await tx.update(appSettings).set({ activeGameSessionId: null, updatedAt: new Date() }).where(eq(appSettings.id, 'global'))
      // Cascades delete seed-owned invitations, audit events, and chat rows in this same transaction.
      await tx.delete(gameSessions).where(inArray(gameSessions.id, ids))
    }
    const records: { fixture: Fixture; id: string; created: boolean }[] = []
    for (const fixture of fixtures) {
      const owner = keyFor(fixture)
      let [session] = await tx.select().from(gameSessions).where(eq(gameSessions.createdBy, owner)).limit(1)
      let created = false
      if (!session) { session = await createFixture(tx, fixture); created = true }
      records.push({ fixture, id: session.id, created })
    }
    const activateKey = reset ? (activeOwner ?? (!priorActiveId ? keyFor(fixtures[0]) : null)) : (!priorActiveId ? keyFor(fixtures[0]) : null)
    const activateId = activateKey ? records.find((record) => keyFor(record.fixture) === activateKey)?.id : null
    if (activateId) await tx.update(appSettings).set({ activeGameSessionId: activateId, updatedAt: new Date() }).where(eq(appSettings.id, 'global'))
  return { records, activated: Boolean(activateId), activeSessionId: activateId ?? priorActiveId }
}

export async function seedLocalTestData(db: AppDb, reset = false) {
  return db.transaction((tx) => seedLocalTestDataInTransaction(tx, reset))
}

function validateEnvironment() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed when NODE_ENV=production.')
  if (process.env.LOCAL !== 'true') throw new Error('Set LOCAL=true in the backend environment before seeding.')
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL is required.')
  const url = new URL(raw)
  if (!['localhost', '127.0.0.1', '[::1]', '::1', 'postgres'].includes(url.hostname)) throw new Error(`Refusing non-local PostgreSQL host "${url.hostname}".`)
}

async function main() {
  validateEnvironment()
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--reset')) throw new Error(`Unknown argument: ${args.find((arg) => arg !== '--reset')}`)
  const db = await initDb()
  try {
    const result = await seedLocalTestData(db, args.includes('--reset'))
    for (const { fixture } of result.records) {
      const accountList = fixture.teams.map((team) => team.indexes.map((index, member) => `${fixture.emails[index]}${member === 0 ? ' (leader)' : ''}`).join(', ')).join('; ')
      console.log(`${fixture.name}: ${accountList}`)
    }
    console.log(`Email test login enabled. ${result.records.filter((record) => record.created).length} fixture(s) created.${result.activated ? ' Seed fixture activated.' : ' Existing active session preserved.'}`)
  } finally { await closeDb() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
