import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { and, eq } from 'drizzle-orm'
import { closeDb, initDb, type AppDb } from './db/index.js'
import { sessionEvents } from './db/schema.js'
import { DbSettingsRepository } from './db-settings.js'
import { DbGameSessionsRepository } from './game-sessions.js'
import { DbGameplayRepository } from './gameplay.js'
import { DEFAULT_CONFIG } from './engine/config.js'
import type { EngineEnv, PlayerCommand } from './engine/types.js'

test('PostgreSQL transfers enforce leader auth and atomically persist exact-once money and star transfers', { skip: process.env.RUN_DB_TESTS !== '1' }, async (t) => {
  const db = await initDb()
  t.after(closeDb)
  const rollback = new Error('Rollback isolated money transfer test data')
  try {
    await db.transaction(async (tx) => {
      const connection = tx as unknown as AppDb
      const settings = new DbSettingsRepository(connection)
      await settings.initialize()
      const sessions = new DbGameSessionsRepository(connection)
      let serial = 0
      const gameplay = new DbGameplayRepository(connection, (): EngineEnv => ({ now: 1_000, random: () => 0.5, token: () => `money-db-${++serial}` }))
      const emails = ['lead-a@example.test', 'member-a@example.test', 'lead-b@example.test', 'member-b@example.test', 'solo-c@example.test']
      const session = await sessions.create('Money transfer database test', emails, 'money-transfer-test')
      await sessions.setActive(session.id, 'money-transfer-test')
      for (const player of session.players) await sessions.arrive(session.id, player.id, 'money-transfer-test')
      const arrived = await sessions.get(session.id)
      const ids = arrived.players.map((player) => player.id)
      const teams = [
        { name: 'Team A', playerIds: ids.slice(0, 2) },
        { name: 'Team B', playerIds: ids.slice(2, 4) },
        { name: 'Team C', playerIds: [ids[4]!] },
      ]
      const config = structuredClone(DEFAULT_CONFIG)
      config.initialBalance = 100
      await gameplay.start(session.id, teams, config, 'money-transfer-test', 'bomb')
      let state = (await gameplay.adminView(session.id)).state!
      const teamA = state.teams.find((team) => team.name === 'Team A')!
      const teamB = state.teams.find((team) => team.name === 'Team B')!
      const teamC = state.teams.find((team) => team.name === 'Team C')!

      await gameplay.adjustAccount(session.id, 'money-transfer-test', { requestId: randomUUID(), expectedRevision: state.revision, teamId: teamA.id, balance: '100.00', stars: 4 })
      state = (await gameplay.adminView(session.id)).state!
      await gameplay.adjustAccount(session.id, 'money-transfer-test', { requestId: randomUUID(), expectedRevision: state.revision, teamId: teamB.id, balance: '100.00', stars: 1 })
      state = (await gameplay.adminView(session.id)).state!
      const starCommand: PlayerCommand = { requestId: randomUUID(), token: state.current.token, action: { type: 'stars.transfer', recipientTeamId: teamB.id, stars: 1 } }
      await assert.rejects(gameplay.action(emails[1]!, starCommand, 'member-a'), { code: 'BAD_REQUEST' })
      await gameplay.action(emails[0]!, starCommand, 'leader-a')
      const starRevision = (await gameplay.adminView(session.id)).state!.revision
      await gameplay.action(emails[0]!, starCommand, 'leader-a-retry')
      assert.equal((await gameplay.adminView(session.id)).state!.revision, starRevision)

      // Concurrent commands serialize under the session lock and cannot overspend the shared star total.
      const concurrentStars: PlayerCommand[] = [
        { requestId: randomUUID(), token: starCommand.token, action: { type: 'stars.transfer', recipientTeamId: teamB.id, stars: 1 } },
        { requestId: randomUUID(), token: starCommand.token, action: { type: 'stars.transfer', recipientTeamId: teamC.id, stars: 1 } },
      ]
      const starsBeforeConcurrent = (await gameplay.adminView(session.id)).state!.teams.reduce((sum, team) => sum + team.stars, 0)
      await Promise.all(concurrentStars.map((command) => gameplay.action(emails[0]!, command, 'leader-a-concurrent')))
      state = (await gameplay.adminView(session.id)).state!
      assert.equal(state.teams.reduce((sum, team) => sum + team.stars, 0), starsBeforeConcurrent)
      const concurrentAudit = await connection.select().from(sessionEvents).where(and(
        eq(sessionEvents.sessionId, session.id), eq(sessionEvents.type, 'stars.transferred'),
      ))
      assert.equal(concurrentAudit.length, 3) // original transfer plus both serialized commands

      const staleStarCommand: PlayerCommand = { requestId: randomUUID(), token: state.current.token, action: { type: 'stars.transfer', recipientTeamId: teamB.id, stars: 1 } }
      await gameplay.startRound(session.id, 'money-transfer-test')
      await assert.rejects(gameplay.action(emails[0]!, staleStarCommand, 'leader-a-stale-window'), { code: 'BAD_REQUEST' })
      const activeState = (await gameplay.adminView(session.id)).state!
      assert.notEqual(activeState.advantagedTeamId, null)
      await assert.rejects(gameplay.action(emails[0]!, { ...staleStarCommand, requestId: randomUUID(), token: activeState.current.token }, 'leader-a-closed-window'), { code: 'BAD_REQUEST' })

      const stateAfterFinaleStarts = (await gameplay.adminView(session.id)).state!
      const command: PlayerCommand = {
        requestId: randomUUID(), token: stateAfterFinaleStarts.current.token,
        action: { type: 'money.transfer', recipientTeamIds: [teamC.id, teamB.id], amount: '25.37' },
      }

      await assert.rejects(gameplay.action(emails[1]!, command, 'member-a'), { code: 'BAD_REQUEST' })
      const playerView = await gameplay.action(emails[0]!, command, 'leader-a')
      assert.equal(playerView.team?.balance, '74.63')
      assert.deepEqual(playerView.moneyTransfers.map(({ fromTeamId, toTeamId, amount }) => ({ fromTeamId, toTeamId, amount })), [
        { fromTeamId: teamA.id, toTeamId: teamB.id, amount: '12.69' },
        { fromTeamId: teamA.id, toTeamId: teamC.id, amount: '12.68' },
      ])

      const revision = (await gameplay.adminView(session.id)).state!.revision
      await gameplay.action(emails[0]!, command, 'leader-a-retry')
      assert.equal((await gameplay.adminView(session.id)).state!.revision, revision)
      await assert.rejects(gameplay.action(emails[0]!, {
        ...command, action: { type: 'money.transfer', recipientTeamIds: [teamB.id, teamC.id], amount: '25.36' },
      }, 'leader-a-reused-id'), { code: 'BAD_REQUEST' })
      await assert.rejects(gameplay.action(emails[0]!, {
        requestId: randomUUID(), token: command.token,
        action: { type: 'money.transfer', recipientTeamIds: [teamB.id, teamC.id], amount: '75.00' },
      }, 'leader-a-overspend'), { code: 'BAD_REQUEST' })
      assert.equal((await gameplay.adminView(session.id)).state!.revision, revision)
      await assert.rejects(gameplay.action(emails[0]!, { ...command, requestId: randomUUID(), token: 'stale-token' }, 'leader-a-stale'), { code: 'BAD_REQUEST' })

      const persisted = (await gameplay.adminView(session.id)).state!
      assert.equal(persisted.teams.find((team) => team.id === teamA.id)?.balance, '7463')
      assert.equal(persisted.teams.find((team) => team.id === teamB.id)?.balance, '11269')
      assert.equal(persisted.teams.find((team) => team.id === teamC.id)?.balance, '11268')
      assert.equal(persisted.moneyTransfers?.length, 2)
      const commandAudits = await connection.select().from(sessionEvents).where(and(
        eq(sessionEvents.sessionId, session.id), eq(sessionEvents.type, 'player.command'),
      ))
      const audit = commandAudits.find((event) => event.data.requestId === command.requestId)
      assert.equal(audit?.data.requestId, command.requestId)
      assert.deepEqual(audit?.data.action, command.action)
      const transferAudit = await connection.select().from(sessionEvents).where(and(
        eq(sessionEvents.sessionId, session.id), eq(sessionEvents.type, 'money.transferred'),
      ))
      assert.equal(transferAudit.length, 2)
      const starTransferAudit = await connection.select().from(sessionEvents).where(and(
        eq(sessionEvents.sessionId, session.id), eq(sessionEvents.type, 'stars.transferred'),
      ))
      assert.equal(starTransferAudit.length, 3)

      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }
})
