import 'dotenv/config'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eq, sql } from 'drizzle-orm'
import { closeDb, initDb } from './db/index.js'
import { appSettings, chatConversations, chatConversationMembers, chatMessages, gameSessions, sessionPlayers } from './db/schema.js'
import { seedLocalTestDataInTransaction, type SeedTransaction } from './seed-test-data.js'

test('local seed creates stable engine-backed fixtures, preserves reruns, and resets only owned sessions atomically',
  { skip: process.env.RUN_DB_TESTS !== '1' }, async (t) => {
    const db = await initDb()
    t.after(closeDb)
    const rollback = new Error('Rollback seed database test data')
    try {
      await db.transaction(async (rawTx) => {
        const tx = rawTx as unknown as SeedTransaction
        await tx.insert(appSettings).values({ id: 'global' }).onConflictDoNothing()
        // Start from fresh seed fixtures regardless of live progress; the enclosing transaction rolls this back.
        await seedLocalTestDataInTransaction(tx, true)
        const [unrelated] = await tx.insert(gameSessions).values({ name: 'Unrelated session', createdBy: 'seed-test-unrelated' }).returning()
        const [unrelatedPlayer] = await tx.insert(sessionPlayers).values({ sessionId: unrelated.id, email: 'unrelated@test.com', arrivalOrder: 1 }).returning()
        const [unrelatedChat] = await tx.insert(chatConversations).values({ sessionId: unrelated.id, kind: 'direct', directKey: 'unrelated-chat', createdByPlayerId: unrelatedPlayer.id }).returning()
        await tx.insert(chatConversationMembers).values({ conversationId: unrelatedChat.id, playerId: unrelatedPlayer.id })
        await tx.insert(chatMessages).values({ conversationId: unrelatedChat.id, senderPlayerId: unrelatedPlayer.id, clientMessageId: 'unrelated-message', text: 'keep me' })
        await tx.update(appSettings).set({ activeGameSessionId: unrelated.id })

        const first = await seedLocalTestDataInTransaction(tx)
        assert.equal(first.records.length, 6)
        assert.equal(first.records.filter((item) => item.fixture.game === 'bonus').length, 2)
        const byKey = new Map(first.records.map((record) => [record.fixture.key, record]))
        const e2e = byKey.get('e2e')!
        const e2ePeople = await tx.select().from(sessionPlayers).where(eq(sessionPlayers.sessionId, e2e.id))
        assert.equal(e2ePeople.length, 10)
        assert.deepEqual(e2ePeople.sort((a, b) => a.arrivalOrder! - b.arrivalOrder!).map((p) => p.email), e2e.fixture.emails)
        const e2eRow = (await tx.select().from(gameSessions).where(eq(gameSessions.id, e2e.id)))[0]!
        assert.equal(e2eRow.currentGame, 'bonus')
        assert.equal(e2eRow.currentRound, 1)
        assert.equal((e2eRow.state as { current: { phase: string } }).current.phase, 'ready')

        for (const record of first.records.filter((item) => item.fixture.preview)) {
          const [row] = await tx.select().from(gameSessions).where(eq(gameSessions.id, record.id))
          const state = row.state as { current: { game: string; phase: string }; round: number; teams: { balance: string; stars: number }[]; history: unknown[] }
          assert.equal(state.current.game, record.fixture.game)
          assert.equal(state.current.phase, 'ready')
          assert.equal(state.round, 1)
          assert.ok(state.teams.every((team) => BigInt(team.balance) > 0n))
          if (record.fixture.game === 'circle' || record.fixture.game === 'bomb') assert.ok(state.teams.some((team) => team.stars > 0))
          if (record.fixture.game !== 'bonus') assert.ok(state.history.length > 0)
        }

        // Attach chat data to a seed fixture so reset proves all dependent rows cascade away.
        const [player] = e2ePeople
        const [conversation] = await tx.insert(chatConversations).values({ sessionId: e2e.id, kind: 'direct', directKey: 'seed-chat-test', createdByPlayerId: player.id }).returning()
        await tx.insert(chatConversationMembers).values({ conversationId: conversation.id, playerId: player.id })
        await tx.insert(chatMessages).values({ conversationId: conversation.id, senderPlayerId: player.id, clientMessageId: 'seed-test-message', text: 'hello' })

        // Simulate play progress and an admin rename. A normal rerun must preserve both.
        const progressedState = { ...e2eRow.state, revision: 77, marker: 'progress-must-survive' }
        await tx.update(gameSessions).set({ name: 'Renamed E2E fixture', state: progressedState }).where(eq(gameSessions.id, e2e.id))
        await tx.update(appSettings).set({ activeGameSessionId: e2e.id })
        const repeated = await seedLocalTestDataInTransaction(tx)
        assert.equal(repeated.records.length, 6)
        assert.ok(repeated.records.every((record) => !record.created))
        const [preserved] = await tx.select().from(gameSessions).where(eq(gameSessions.id, e2e.id))
        assert.equal(preserved.name, 'Renamed E2E fixture')
        assert.equal((preserved.state as { marker: string }).marker, 'progress-must-survive')
        assert.equal((await tx.select().from(appSettings).where(eq(appSettings.id, 'global')))[0]!.activeGameSessionId, e2e.id)

        // Reset while a UX fixture is active; the same fixture key stays active after recreation.
        const circle = byKey.get('preview-circle')!
        await tx.update(appSettings).set({ activeGameSessionId: circle.id })
        await seedLocalTestDataInTransaction(tx, true)
        const owned = await tx.select().from(gameSessions).where(sql`${gameSessions.createdBy} like 'local-seed:v1:%'`)
        assert.equal(owned.length, 6)
        assert.equal(owned.some((row) => row.id === e2e.id), false)
        assert.ok(owned.some((row) => row.name === 'E2E Playthrough'))
        assert.ok(owned.some((row) => row.name === 'UX Preview What Goes Around Comes Around'))
        const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, 'global'))
        const active = owned.find((row) => row.id === settings.activeGameSessionId)
        assert.equal(active?.createdBy, 'local-seed:v1:preview-circle')
        assert.equal((await tx.select().from(chatConversations).where(eq(chatConversations.id, conversation.id))).length, 0)
        assert.equal((await tx.select().from(chatMessages).where(eq(chatMessages.conversationId, conversation.id))).length, 0)
        assert.equal((await tx.select().from(gameSessions).where(eq(gameSessions.id, unrelated.id))).length, 1)
        assert.equal((await tx.select().from(chatConversations).where(eq(chatConversations.id, unrelatedChat.id))).length, 1)
        assert.equal((await tx.select().from(chatMessages).where(eq(chatMessages.conversationId, unrelatedChat.id))).length, 1)

        // Resetting while an unrelated session is active must leave it active.
        await tx.update(appSettings).set({ activeGameSessionId: unrelated.id })
        await seedLocalTestDataInTransaction(tx, true)
        const [unrelatedActiveSettings] = await tx.select().from(appSettings).where(eq(appSettings.id, 'global'))
        assert.equal(unrelatedActiveSettings.activeGameSessionId, unrelated.id)

        // With no active session, reset should activate E2E for a fresh local setup.
        await tx.update(appSettings).set({ activeGameSessionId: null })
        await seedLocalTestDataInTransaction(tx, true)
        const [freshSettings] = await tx.select().from(appSettings).where(eq(appSettings.id, 'global'))
        const freshActive = await tx.select().from(gameSessions).where(eq(gameSessions.id, freshSettings.activeGameSessionId!))
        assert.equal(freshActive[0]?.createdBy, 'local-seed:v1:e2e')

        // Prove the test leaves the shared local DB untouched, including inserted audit rows/settings.
        throw rollback
      })
    } catch (error) {
      if (error !== rollback) throw error
    }
    assert.equal((await db.select().from(gameSessions).where(eq(gameSessions.createdBy, 'seed-test-unrelated'))).length, 0)
  })
