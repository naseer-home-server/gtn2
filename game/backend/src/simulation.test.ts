import assert from 'node:assert/strict'
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import express from 'express'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import pg from 'pg'
import * as schema from './db/schema.js'
import type { AppDb } from './db/index.js'
import { DbSettingsRepository } from './db-settings.js'
import { DbGameSessionsRepository } from './game-sessions.js'
import { DbGameplayRepository } from './gameplay.js'
import { DbChatsRepository } from './chats.js'
import { DEFAULT_CONFIG } from './engine/config.js'
import { SimulationBridge } from './simulation.js'

async function withServer(app: express.Express, run: (origin: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1')
  try {
    await new Promise<void>((resolve) => server.on('listening', resolve))
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('simulation bridge fails closed when no sufficiently strong service key is configured', async () => {
  const app = express()
  new SimulationBridge({} as never, {} as never, {} as never, {} as never, 'short').mount(app)
  await withServer(app, async (origin) => {
    const response = await fetch(`${origin}/api/simulation/sessions`, { method: 'POST' })
    assert.equal(response.status, 404)
  })
})

test('simulation service routes reject missing or incorrect service credentials before touching repositories', async () => {
  const app = express()
  new SimulationBridge({} as never, {} as never, {} as never, {} as never, 'x'.repeat(40)).mount(app)
  await withServer(app, async (origin) => {
    for (const value of [undefined, 'wrong']) {
      const response = await fetch(`${origin}/api/simulation/sessions`, { method: 'POST', headers: value ? { 'x-simulation-service-key': value } : {} })
      assert.equal(response.status, 401)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
  })
})

test('simulation setup, player capabilities, controls, and actions share the persistent game repositories', { skip: process.env.RUN_DB_TESTS !== '1' }, async (t) => {
  const databaseUrl = process.env.SIMULATION_TEST_DATABASE_URL ?? process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('SIMULATION_TEST_DATABASE_URL or DATABASE_URL is required for the isolated simulation integration test.')
  const { Pool } = pg
  const parsedDatabaseUrl = new URL(databaseUrl)
  const sslMode = parsedDatabaseUrl.searchParams.get('sslmode')
  parsedDatabaseUrl.searchParams.delete('sslmode')
  const poolConfig = { connectionString: parsedDatabaseUrl.toString(), ...(sslMode === 'require' ? { ssl: { rejectUnauthorized: false } } : {}) }
  const bootstrap = new Pool(poolConfig)
  const schemaName = `sim_test_${randomUUID().replaceAll('-', '')}`
  await bootstrap.query(`CREATE SCHEMA "${schemaName}"`)
  const pool = new Pool({ ...poolConfig, options: `-c search_path=${schemaName}` })
  const testDb = drizzle(pool, { schema }) as NodePgDatabase<typeof schema>
  t.after(async () => {
    await pool.end()
    await bootstrap.query(`DROP SCHEMA "${schemaName}" CASCADE`)
    await bootstrap.end()
  })
  const drizzleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle')
  for (const migration of ['0000_add_app_settings.sql', '0001_game_sessions.sql', '0002_arrival_order_constraints.sql', '0003_silly_crusher_hogan.sql', '0004_player_chats.sql', '0005_simulation_sessions.sql', '0006_living_slayback.sql']) {
    const sql = (await readFile(path.join(drizzleDir, migration), 'utf8')).replaceAll('"public".', `"${schemaName}".`)
    for (const statement of sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) await pool.query(statement)
  }
  const connection = testDb as unknown as AppDb
      const settings = new DbSettingsRepository(connection)
      await settings.initialize()
      const sessions = new DbGameSessionsRepository(connection)
      const gameplay = new DbGameplayRepository(connection)
      const chats = new DbChatsRepository(connection)
      const app = express()
      new SimulationBridge(connection, sessions, gameplay, chats, 'simulation-test-secret-'.padEnd(40, 'x')).mount(app)
      const server = app.listen(0, '127.0.0.1')
      try {
        await new Promise<void>((resolve) => server.on('listening', resolve))
        const address = server.address()
        assert.ok(address && typeof address !== 'string')
        const origin = `http://127.0.0.1:${address.port}`
        const serviceHeaders = { 'content-type': 'application/json', 'x-simulation-service-key': 'simulation-test-secret-'.padEnd(40, 'x') }
        const config = structuredClone(DEFAULT_CONFIG)
        config.cave.collapseRisk = [0, 0, 0, 0, 0, 0, 0]
        const setup = { requestId: randomUUID(), name: `Simulation ${randomUUID()}`, teamCount: 7, seed: 73, config }
        const create = () => fetch(`${origin}/api/simulation/sessions`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify(setup) })
        const firstResponse = await create()
        assert.equal(firstResponse.status, 201)
        const first = await firstResponse.json() as { sessionId: string; players: Array<{ agentId: string; teamId: string; playerId: string; email: string; credential: string }> }
        assert.equal(first.players.length, 7)
        assert.equal((await sessions.get(first.sessionId)).players.length, 14)
        assert.ok(first.players.every((player) => player.teamId && player.credential))
        const retryResponse = await create()
        const retry = await retryResponse.json() as typeof first
        assert.equal(retryResponse.status, 201)
        assert.equal(retry.sessionId, first.sessionId)
        assert.deepEqual(retry.players.map(({ credential }) => credential), first.players.map(({ credential }) => credential))
        const mismatchedRetry = await fetch(`${origin}/api/simulation/sessions`, { method: 'POST', headers: serviceHeaders,
          body: JSON.stringify({ ...setup, name: `${setup.name} changed` }) })
        assert.equal(mismatchedRetry.status, 409)
        const concurrentSetup = { ...setup, requestId: randomUUID(), name: `${setup.name} concurrent` }
        const concurrentCreate = () => fetch(`${origin}/api/simulation/sessions`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify(concurrentSetup) })
        const [concurrentAResponse, concurrentBResponse] = await Promise.all([concurrentCreate(), concurrentCreate()])
        const [concurrentA, concurrentB] = await Promise.all([concurrentAResponse.json(), concurrentBResponse.json()]) as [{ sessionId: string; players: typeof first.players }, { sessionId: string; players: typeof first.players }]
        assert.equal(concurrentAResponse.status, 201)
        assert.equal(concurrentBResponse.status, 201, JSON.stringify(concurrentB))
        assert.equal(concurrentA.sessionId, concurrentB.sessionId)
        assert.deepEqual(concurrentA.players.map(({ credential }) => credential), concurrentB.players.map(({ credential }) => credential))
        await sessions.setActive(first.sessionId, 'simulation:runner')
        const invited = (await sessions.get(first.sessionId)).players
        const groupResponse = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/players/${first.players[0]!.agentId}/chat/groups`, {
          method: 'POST', headers: { ...serviceHeaders, authorization: `Bearer ${first.players[0]!.credential}` },
          body: JSON.stringify({ name: 'All fourteen players', playerIds: invited.filter(member => member.id !== first.players[0]!.playerId).map(member => member.id) }),
        })
        assert.equal(groupResponse.status, 200)
        const group = await groupResponse.json() as { playerIds: string[] }
        assert.equal(group.playerIds.length, 14)
        const tooManyTeams = await fetch(`${origin}/api/simulation/sessions`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify({ ...setup, requestId: randomUUID(), teamCount: 8 }) })
        assert.equal(tooManyTeams.status, 400)

        const player = first.players[0]!
        const playerHeaders = { ...serviceHeaders, authorization: `Bearer ${player.credential}` }
        const stateResponse = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/players/${player.agentId}/state`, { headers: playerHeaders })
        assert.equal(stateResponse.status, 200)
        const initial = await stateResponse.json() as { token: string | null; team: unknown }
        assert.ok(initial.team)
        assert.ok(initial.token)
        const denied = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/players/${first.players[1]!.agentId}/state`, { headers: playerHeaders })
        assert.equal(denied.status, 403)

        const startRequestId = randomUUID()
        const control = () => fetch(`${origin}/api/simulation/sessions/${first.sessionId}/control`, { method: 'POST', headers: serviceHeaders,
          body: JSON.stringify({ requestId: startRequestId, operation: 'start', expectedToken: (initial as { token: string }).token }) })
        const startedResponse = await control()
        const started = await startedResponse.json() as { revision: number }
        assert.equal(startedResponse.status, 200)
        const repeatedControl = await control()
        assert.equal(repeatedControl.status, 200)
        assert.equal((await repeatedControl.json() as { revision: number }).revision, started.revision)

        const staleAdvance = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/control`, { method: 'POST', headers: serviceHeaders,
          body: JSON.stringify({ requestId: randomUUID(), operation: 'advance', expectedToken: (initial as { token: string }).token }) })
        assert.equal(staleAdvance.status, 400, 'expectedToken is checked for advance as well as start/tick')

        const currentResponse = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/players/${player.agentId}/state`, { headers: playerHeaders })
        const current = await currentResponse.json() as { token: string; allowedActions: string[] }
        assert.ok(current.allowedActions.includes('bonus.take'))
        const command = { requestId: randomUUID(), token: current.token, action: { type: 'bonus.take', amount: '0.00' } }
        const actionRequest = () => fetch(`${origin}/api/simulation/sessions/${first.sessionId}/players/${player.agentId}/actions`, { method: 'POST', headers: playerHeaders, body: JSON.stringify(command) })
        const actionResponse = await actionRequest()
        assert.equal(actionResponse.status, 200)
        const afterAction = await actionResponse.json() as { token: string | null; earnings: unknown[] }
        const retryAction = await actionRequest()
        assert.equal(retryAction.status, 200)
        assert.deepEqual(await retryAction.json(), afterAction)

        const sendControl = (operation: 'start' | 'advance' | 'tick', expectedToken?: string) => fetch(`${origin}/api/simulation/sessions/${first.sessionId}/control`, {
          method: 'POST', headers: serviceHeaders, body: JSON.stringify({ requestId: randomUUID(), operation, ...(expectedToken ? { expectedToken } : {}) }),
        })
        for (let round = 0; round < 6; round += 1) {
          if (round > 0) assert.equal((await sendControl('advance')).status, 200)
          const agents = round === 0 ? first.players.slice(1) : first.players
          for (const agent of agents) {
            const viewResponse = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/players/${agent.agentId}/state`, { headers: { ...serviceHeaders, authorization: `Bearer ${agent.credential}` } })
            const view = await viewResponse.json() as { game: string; token: string; allowedActions: string[] }
            const action = view.game === 'bonus' ? { type: 'bonus.take', amount: '0.00' } : { type: 'high-low.choose', amount: '0.00' }
            const actionResponse = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/players/${agent.agentId}/actions`, { method: 'POST', headers: { ...serviceHeaders, authorization: `Bearer ${agent.credential}` },
              body: JSON.stringify({ requestId: randomUUID(), token: view.token, action }) })
            const actionResult = await actionResponse.json()
            assert.equal(actionResponse.status, 200, JSON.stringify({ round, agentId: agent.agentId, game: view.game, result: actionResult }))
          }
        }
        assert.equal((await sendControl('advance')).status, 200)
        const caveReadyResponse = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}`, { headers: serviceHeaders })
        const caveReady = await caveReadyResponse.json() as { revision: number; state: { current: { game: string; token: string } } }
        assert.equal(caveReady.state.current.game, 'cave')
        await gameplay.tick()
        const afterWallTicker = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}`, { headers: serviceHeaders })
        assert.equal((await afterWallTicker.json() as { revision: number }).revision, caveReady.revision)
        const tickRequestId = randomUUID()
        const tick = () => fetch(`${origin}/api/simulation/sessions/${first.sessionId}/control`, { method: 'POST', headers: serviceHeaders,
          body: JSON.stringify({ requestId: tickRequestId, operation: 'tick', expectedToken: caveReady.state.current.token }) })
        const [beforeTick] = await connection.select({ simulation: schema.gameSessions.simulation }).from(schema.gameSessions).where(eq(schema.gameSessions.id, first.sessionId))
        const beforeRandomState = (beforeTick.simulation as { randomState: number }).randomState
        const tickResponse = await tick()
        assert.equal(tickResponse.status, 200)
        const tickResult = await tickResponse.json() as { revision: number }
        const [afterTick] = await connection.select({ simulation: schema.gameSessions.simulation }).from(schema.gameSessions).where(eq(schema.gameSessions.id, first.sessionId))
        const afterRandomState = (afterTick.simulation as { randomState: number }).randomState
        assert.notEqual(afterRandomState, beforeRandomState)
        const tickRetry = await tick()
        assert.equal(tickRetry.status, 200)
        const tickRetryResult = await tickRetry.json() as { revision: number }
        const [afterRetry] = await connection.select({ simulation: schema.gameSessions.simulation }).from(schema.gameSessions).where(eq(schema.gameSessions.id, first.sessionId))
        assert.equal(tickRetryResult.revision, tickResult.revision)
        assert.equal((afterRetry.simulation as { randomState: number }).randomState, afterRandomState)

        const humanSession = await sessions.create(`Temporary human active ${randomUUID()}`, ['human-active@example.test'], 'simulation-test')
        await sessions.setActive(humanSession.id, 'simulation-test')
        const secondSetup = { ...setup, requestId: randomUUID(), name: `${setup.name} second run` }
        const secondResponse = await fetch(`${origin}/api/simulation/sessions`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify(secondSetup) })
        assert.equal(secondResponse.status, 201)
        const second = await secondResponse.json() as typeof first
        const crossSessionState = await fetch(`${origin}/api/simulation/sessions/${second.sessionId}/players/${player.agentId}/state`, { headers: playerHeaders })
        assert.equal(crossSessionState.status, 401)
        const inactiveState = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/players/${player.agentId}/state`, { headers: playerHeaders })
        assert.equal(inactiveState.status, 403)
        const inactiveChat = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/players/${player.agentId}/chat/inbox`, { headers: playerHeaders })
        assert.equal(inactiveChat.status, 403)
        const inactiveAction = await actionRequest()
        assert.equal(inactiveAction.status, 403)
        const inactiveControl = await fetch(`${origin}/api/simulation/sessions/${first.sessionId}/control`, { method: 'POST', headers: serviceHeaders,
          body: JSON.stringify({ requestId: randomUUID(), operation: 'advance' }) })
        assert.equal(inactiveControl.status, 400, 'new controls cannot mutate a simulation after it stops being active')
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      }
})
