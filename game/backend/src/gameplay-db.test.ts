import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { eq } from 'drizzle-orm'
import { closeDb, initDb, type AppDb } from './db/index.js'
import { sessionEvents } from './db/schema.js'
import { DbSettingsRepository } from './db-settings.js'
import { DbGameSessionsRepository } from './game-sessions.js'
import { DbGameplayRepository } from './gameplay.js'
import { DEFAULT_CONFIG } from './engine/config.js'
import { appRouter } from './router.js'
import type { EngineEnv, GameAction, TeamAssignment } from './engine/types.js'
import type { AuthUser } from './trpc.js'

test('PostgreSQL gameplay repository and API enforce playthrough rules and persist private audit events', { skip: process.env.RUN_DB_TESTS !== '1' }, async (t) => {
  const db = await initDb()
  t.after(closeDb)
  const rollback = new Error('Rollback gameplay database test data')
  try {
    await db.transaction(async (tx) => {
      const connection = tx as unknown as AppDb
      const settings = new DbSettingsRepository(connection)
      await settings.initialize()
      const sessions = new DbGameSessionsRepository(connection)
      let now = 1_000
      let tokenCount = 0
      const gameplay = new DbGameplayRepository(connection, (): EngineEnv => ({ now, random: () => 0.5, token: () => `db-test-token-${++tokenCount}` }))
      const createCaller = (user: AuthUser | null) => appRouter.createCaller({
        user, settings, sessions, gameplay, signInWithTestEmail: async () => undefined,
      })
      const adminUser: AuthUser = { id: 'db-test-admin', email: 'admin@example.test', isAdmin: true, isTestLogin: false }
      const admin = createCaller(adminUser)

      const emails = ['alice@example.test', 'alex@example.test', 'brian@example.test', 'beth@example.test', 'solo@example.test']
      const session = await sessions.create('Gameplay database test', emails, adminUser.id)
      await sessions.setActive(session.id, adminUser.id)
      for (const player of session.players.slice(0, 4)) await sessions.arrive(session.id, player.id, adminUser.id)
      const arrived = await sessions.get(session.id)
      const ids = arrived.players.map((player) => player.id)
      const assignments: TeamAssignment[] = [
        { name: 'Pair A', playerIds: ids.slice(0, 2) },
        { name: 'Pair B', playerIds: ids.slice(2, 4) },
        { name: 'Solo', playerIds: [ids[4]] },
      ]
      const config = structuredClone(DEFAULT_CONFIG)
      config.initialBalance = 100
      config.cave.collapseRisk = [0, 0, 0, 0, 0]

      await assert.rejects(admin.admin.game.start({ sessionId: session.id, teams: assignments, config }), { code: 'BAD_REQUEST' })
      await assert.rejects(admin.admin.game.start({ sessionId: session.id, teams: [
        { name: 'First', playerIds: [ids[0], ids[1]] },
        { name: 'Duplicate', playerIds: [ids[1], ids[2]] },
        { name: 'Last', playerIds: [ids[3], ids[4]] },
      ], config }), { code: 'BAD_REQUEST' })
      await assert.rejects(admin.admin.game.start({ sessionId: session.id, teams: [
        { name: 'Solo one', playerIds: [ids[0]] },
        { name: 'Solo two', playerIds: [ids[1]] },
        { name: 'Pair', playerIds: [ids[2], ids[3]] },
      ], config }), { code: 'BAD_REQUEST' })
      await sessions.arrive(session.id, ids[4], adminUser.id)

      const member = createCaller({ id: 'alice-user', email: emails[0], isAdmin: false, isTestLogin: false })
      const outsider = createCaller({ id: 'outsider-user', email: 'outsider@example.test', isAdmin: false, isTestLogin: false })
      await assert.rejects(outsider.game.state(), { code: 'FORBIDDEN' })
      await assert.rejects(outsider.auth.me(), { code: 'FORBIDDEN' })
      await assert.rejects(member.admin.game.state({ sessionId: session.id }), { code: 'FORBIDDEN' })
      await assert.rejects(member.admin.game.start({ sessionId: session.id, teams: assignments, config }), { code: 'FORBIDDEN' })
      await assert.rejects(member.admin.game.advance({ sessionId: session.id }), { code: 'FORBIDDEN' })

      await admin.admin.game.start({ sessionId: session.id, teams: assignments, config })
      const started = (await admin.admin.game.state({ sessionId: session.id })).state!
      assert.deepEqual(started.teams.map((team) => team.balance), ['10000', '10000', '10000'])
      assert.deepEqual(started.teams.map((team) => team.tieOrder), [1, 3, 5])
      const pairOne = createCaller({ id: 'alex-user', email: emails[1], isAdmin: false, isTestLogin: false })
      const aliceView = await member.game.state()
      const alexView = await pairOne.game.state()
      assert.equal(aliceView.team?.id, alexView.team?.id)
      assert.equal(aliceView.team?.balance, alexView.team?.balance)
      assert.ok(aliceView.allowedActions.includes('bonus.take'))
      assert.ok(alexView.allowedActions.includes('bonus.take'))
      assert.equal(aliceView.teams.length, 3)
      assert.ok(aliceView.teams.every((team) => !('balance' in team)))

      const actionLog = async (email: string, action: GameAction, requestId = randomUUID(), token?: string) => {
        const state = (await admin.admin.game.state({ sessionId: session.id })).state!
        return gameplay.action(email, { requestId, token: token ?? state.current.token, action }, `actor:${email}`)
      }

      // Oversized contributions are capped at the remaining target and spent exactly once.
      const contributionRequestId = randomUUID()
      const contributionToken = started.current.token
      const revealView = await gameplay.action(emails[0], {
        requestId: contributionRequestId, token: contributionToken, action: { type: 'pot.contribute', amount: 200 },
      }, `actor:${emails[0]}`)
      assert.equal(revealView.team?.balance, '0.00')
      assert.equal(revealView.pot.amount, '0.00')
      assert.equal(revealView.reveal?.rankings.length, 3)
      assert.deepEqual(Object.keys(revealView.reveal ?? {}).sort(), ['id', 'rankings'])
      assert.ok(revealView.reveal?.rankings.every((rank) => !('balance' in rank)))
      const revisionAtReveal = (await admin.admin.game.state({ sessionId: session.id })).state!.revision
      await gameplay.action(emails[1], {
        requestId: contributionRequestId, token: contributionToken, action: { type: 'pot.contribute', amount: 200 },
      }, `actor:${emails[1]}`)
      assert.equal((await admin.admin.game.state({ sessionId: session.id })).state!.revision, revisionAtReveal)
      await assert.rejects(gameplay.action(emails[1], {
        requestId: contributionRequestId, token: contributionToken, action: { type: 'pot.contribute', amount: 201 },
      }, `actor:${emails[1]}`), { code: 'BAD_REQUEST' })

      const ackToken = (await admin.admin.game.state({ sessionId: session.id })).state!.current.token
      await actionLog(emails[0], { type: 'reveal.acknowledge' }, randomUUID(), ackToken)
      assert.equal((await gameplay.playerView(emails[1])).reveal, null) // the pair shares one team acknowledgment
      await assert.rejects(actionLog(emails[1], { type: 'reveal.acknowledge' }, randomUUID(), ackToken), { code: 'BAD_REQUEST' })
      await actionLog(emails[2], { type: 'reveal.acknowledge' }, randomUUID(), ackToken)
      await actionLog(emails[4], { type: 'reveal.acknowledge' }, randomUUID(), ackToken)
      assert.equal((await gameplay.playerView(emails[0])).reveal, null)
      const afterReveal = (await admin.admin.game.state({ sessionId: session.id })).state!
      assert.notEqual(afterReveal.current.token, ackToken)
      assert.equal(afterReveal.reveal, null)

      const firstTeamId = afterReveal.teams[0].id
      const firstChoiceRequest = randomUUID()
      const currentToken = afterReveal.current.token
      await gameplay.action(emails[0], { requestId: firstChoiceRequest, token: currentToken, action: { type: 'bonus.take', amount: 0 } }, `actor:${emails[0]}`)
      const revisionAfterChoice = (await admin.admin.game.state({ sessionId: session.id })).state!.revision
      await gameplay.action(emails[1], { requestId: firstChoiceRequest, token: currentToken, action: { type: 'bonus.take', amount: 0 } }, `actor:${emails[1]}`)
      assert.equal((await admin.admin.game.state({ sessionId: session.id })).state!.revision, revisionAfterChoice)
      await assert.rejects(gameplay.action(emails[1], { requestId: randomUUID(), token: currentToken, action: { type: 'bonus.take', amount: 1 } }, `actor:${emails[1]}`), { code: 'BAD_REQUEST' })
      await actionLog(emails[2], { type: 'bonus.take', amount: 0 })
      await actionLog(emails[4], { type: 'bonus.take', amount: 0 })
      assert.equal((await admin.admin.game.state({ sessionId: session.id })).state?.current.phase, 'complete')
      await assert.rejects(gameplay.action(emails[0], { requestId: randomUUID(), token: currentToken, action: { type: 'bonus.take', amount: 0 } }, `actor:${emails[0]}`), { code: 'BAD_REQUEST' })
      await admin.admin.game.advance({ sessionId: session.id })
      await assert.rejects(gameplay.action(emails[0], { requestId: randomUUID(), token: currentToken, action: { type: 'bonus.take', amount: 0 } }, `actor:${emails[0]}`), { code: 'BAD_REQUEST' })

      const playAllRounds = async () => {
        const state = (await admin.admin.game.state({ sessionId: session.id })).state!
        const repEmails = [emails[0], emails[2], emails[4]]
        if (state.current.game === 'bonus' || state.current.game === 'high-low') {
          for (const email of repEmails) await actionLog(email, { type: state.current.game === 'bonus' ? 'bonus.take' : 'high-low.choose', amount: 0 })
        } else if (state.current.game === 'cave') {
          const caveState = state.current
          if (caveState.game === 'cave' && caveState.stage === 'waiting') {
            if (state.round === 1 && !state.history.some((item) => item.game === 'cave')) {
              now = (caveState.nextTickAt ?? now) + 1_000
              const target = (await gameplay.playerView(emails[2])).pot.target
              const paused = await gameplay.action(emails[2], { requestId: randomUUID(), token: caveState.token, action: { type: 'pot.contribute', amount: target } }, `actor:${emails[2]}`)
              assert.ok(paused.reveal)
              await gameplay.tick()
              const stillPaused = (await admin.admin.game.state({ sessionId: session.id })).state!
              assert.equal(stillPaused.current.game, 'cave')
              assert.equal(stillPaused.current.nextTickAt, caveState.nextTickAt)
              assert.equal(stillPaused.current.tick, 0)
              const revealToken = stillPaused.current.token
              await actionLog(emails[0], { type: 'reveal.acknowledge' }, randomUUID(), revealToken)
              await actionLog(emails[2], { type: 'reveal.acknowledge' }, randomUUID(), revealToken)
              await actionLog(emails[4], { type: 'reveal.acknowledge' }, randomUUID(), revealToken)
              const resumed = (await admin.admin.game.state({ sessionId: session.id })).state!
              assert.equal(resumed.current.game, 'cave')
              assert.equal(resumed.current.nextTickAt, now + config.cave.tickSeconds * 1000)
              const pausedAt = resumed.current.nextTickAt!
              now = pausedAt - 1
              await gameplay.tick()
              const beforeResumeTick = (await admin.admin.game.state({ sessionId: session.id })).state!
              assert.equal(beforeResumeTick.current.game, 'cave')
              assert.equal(beforeResumeTick.current.tick, 0)
              now = pausedAt
              await gameplay.tick()
              const afterResumeTick = (await admin.admin.game.state({ sessionId: session.id })).state!
              assert.equal(afterResumeTick.current.game, 'cave')
              assert.equal(afterResumeTick.current.tick, 1)
            }
            now = Math.max(now, caveState.nextTickAt ?? now)
            await gameplay.tick()
          }
          for (const email of repEmails) await actionLog(email, { type: 'cave.decide', decision: 'leave' })
        } else if (state.current.game === 'circle') {
          for (const email of repEmails) await actionLog(email, { type: 'circle.send', money: 0, stars: 0 })
          for (const email of repEmails) await actionLog(email, { type: 'circle.return', money: 0, stars: 0 })
        } else {
          const recipientId = state.teams[1].id
          for (const email of repEmails) await actionLog(email, { type: 'bomb.allocate', up: 1, down: 0, recipients: { [recipientId]: 1 } })
        }
      }

      // First bonus round was used for request/reveal checks; finish all remaining rounds through the DB repository.
      let current = (await admin.admin.game.state({ sessionId: session.id })).state!
      while (current.status === 'playing') {
        if (current.current.phase !== 'complete') await playAllRounds()
        current = (await admin.admin.game.state({ sessionId: session.id })).state!
        if (current.status === 'playing' && current.current.phase === 'complete') {
          await admin.admin.game.advance({ sessionId: session.id })
          current = (await admin.admin.game.state({ sessionId: session.id })).state!
        }
      }
      assert.equal(current.status, 'finished')
      assert.equal(current.history.length, 15)
      assert.equal(current.teams.find((team) => team.id === firstTeamId)?.playerIds.length, 2)

      const audit = await admin.admin.game.state({ sessionId: session.id })
      const commands = audit.events.filter((event) => event.type === 'player.command')
      assert.ok(commands.length >= 40)
      const contributionCommand = commands.find((event) => event.data.requestId === contributionRequestId)!
      assert.equal(contributionCommand.actorId, `actor:${emails[0]}`)
      assert.deepEqual(contributionCommand.data.action, { type: 'pot.contribute', amount: 200 })
      const choiceCommand = commands.find((event) => event.data.requestId === firstChoiceRequest)!
      assert.equal(choiceCommand.actorId, `actor:${emails[0]}`)
      assert.deepEqual(choiceCommand.data.action, { type: 'bonus.take', amount: 0 })
      assert.equal(commands.filter((event) => event.data.requestId === contributionRequestId).length, 1)
      assert.equal(commands.filter((event) => event.data.requestId === firstChoiceRequest).length, 1)

      const persistedEvents = await tx.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id))
      assert.ok(persistedEvents.some((event) => event.type === 'rankings.revealed'))
      assert.ok(persistedEvents.some((event) => event.type === 'player.command' && event.actorId === `actor:${emails[0]}`))
      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }
})
