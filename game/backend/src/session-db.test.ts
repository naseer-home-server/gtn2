import 'dotenv/config'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { closeDb, initDb, type AppDb } from './db/index.js'
import { sessionEvents } from './db/schema.js'
import { DbSettingsRepository } from './db-settings.js'
import { DbGameSessionsRepository } from './game-sessions.js'

test('PostgreSQL persists session membership, activation, arrival order and audit events', { skip: process.env.RUN_DB_TESTS !== '1' }, async (t) => {
  const db = await initDb()
  t.after(closeDb)
  const rollback = new Error('Rollback test data')
  try {
    await db.transaction(async (tx) => {
      const connection = tx as unknown as AppDb
      await new DbSettingsRepository(connection).initialize()
      const repo = new DbGameSessionsRepository(connection)
      const first = await repo.create('Database test', ['one@example.com', 'two@example.com'], 'test-admin')
      const second = await repo.create('Other night', ['other@example.com'], 'test-admin')
      await repo.setActive(first.id, 'test-admin')
      assert.equal((await repo.membership(' ONE@example.com '))?.sessionId, first.id)
      assert.equal(await repo.membership('outsider@example.com'), null)
      await repo.arrive(first.id, first.players[0].id, 'test-admin')
      await repo.arrive(first.id, first.players[0].id, 'test-admin')
      await repo.arrive(first.id, first.players[1].id, 'test-admin')
      const arrived = await repo.get(first.id)
      assert.deepEqual(arrived.players.map((p) => p.arrivalOrder), [1, 2])
      await assert.rejects(repo.reorder(first.id, [first.players[0].id], 'test-admin'), { code: 'BAD_REQUEST' })
      await repo.reorder(first.id, [first.players[1].id, first.players[0].id], 'test-admin')
      assert.equal((await repo.get(first.id)).players[0].id, first.players[1].id)
      await repo.setActive(second.id, 'test-admin')
      assert.equal(await repo.membership('one@example.com'), null)
      assert.equal((await repo.list()).filter((session) => session.isActive).length, 1)
      await repo.setActive(null, 'test-admin')
      assert.equal(await repo.membership('other@example.com'), null)
      const events = await tx.select().from(sessionEvents).where(eq(sessionEvents.sessionId, first.id))
      assert.deepEqual(events.map((e) => e.type).sort(), ['session.created', 'session.activated', 'player.arrived', 'player.arrived', 'players.reordered', 'session.deactivated'].sort())
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }
})
