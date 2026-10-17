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

test('host account/config commands persist roster snapshots, enforce revisions, and retry exactly once', { skip: process.env.RUN_DB_TESTS !== '1' }, async (t) => {
  const db = await initDb()
  t.after(closeDb)
  const rollback = new Error('Rollback host controls fixture')
  try {
    await db.transaction(async tx => {
      const connection = tx as unknown as AppDb
      const settings = new DbSettingsRepository(connection)
      await settings.initialize()
      const sessions = new DbGameSessionsRepository(connection)
      const gameplay = new DbGameplayRepository(connection)
      const actor = { id: 'host-controls-admin', email: 'host@example.test', isAdmin: true, isTestLogin: false }
      const caller = appRouter.createCaller({ user: actor, sessions, settings, gameplay, signInWithTestEmail: async () => {} })
      const profiles = [
        { id: '91', name: 'First Person', firstName: 'First', email: 'first@controls.test' },
        { id: '92', name: 'Second Person', firstName: 'Second', email: 'second@controls.test' },
        { id: '93', name: 'First Other', firstName: 'First', email: 'third@controls.test' },
        { id: '94', name: 'Second Other', firstName: 'Second', email: 'fourth@controls.test' },
      ]
      const session = await sessions.create('Host controls test', profiles.map(x => x.email), actor.id, profiles)
      assert.equal(session.players.find(x => x.email === profiles[0].email)?.firstName, 'First')
      assert.equal(session.players.find(x => x.email === profiles[0].email)?.rosterId, '91')
      for (const profile of profiles) await sessions.arrive(session.id, session.players.find(player => player.email === profile.email)!.id, actor.id)
      const players = (await sessions.get(session.id)).players
      await sessions.setActive(session.id, actor.id)
      await caller.admin.game.start({ sessionId: session.id, teams: [
        { name: 'Forged name', playerIds: players.slice(0, 2).map(x => x.id) },
        { name: 'Another forged name', playerIds: players.slice(2, 4).map(x => x.id) },
      ], config: DEFAULT_CONFIG })
      let state = (await gameplay.adminView(session.id)).state!
      assert.deepEqual(state.teams.map(x => x.name), ['First & Second', 'First & Second'])
      assert.deepEqual(state.teams.map(x => x.tieOrder), [1, 3])
      assert.equal((await gameplay.playerView(profiles[0].email)).rules, undefined)
      const command = { sessionId: session.id, requestId: randomUUID(), expectedRevision: state.revision, teamId: state.teams[0].id, balance: '123.45', stars: 2001, reason: 'Host correction' }
      const member = appRouter.createCaller({ user: { ...actor, id: 'member', email: profiles[0].email, isAdmin: false }, sessions, settings, gameplay, signInWithTestEmail: async () => {} })
      await assert.rejects(member.admin.game.adjustAccount(command), { code: 'FORBIDDEN' })
      await caller.admin.game.adjustAccount(command)
      await caller.admin.game.adjustAccount(command)
      state = (await gameplay.adminView(session.id)).state!
      assert.equal(state.revision, command.expectedRevision + 1)
      assert.equal(state.teams[0].balance, '12345')
      assert.equal(state.teams[0].stars, 2001)
      await assert.rejects(caller.admin.game.adjustAccount({ ...command, balance: '999' }), { code: 'BAD_REQUEST' })
      await assert.rejects(caller.admin.game.adjustAccount({ ...command, requestId: randomUUID() }), { code: 'CONFLICT' })
      const own = await gameplay.playerView(profiles[0].email)
      const other = await gameplay.playerView(profiles[2].email)
      assert.equal(own.team?.balance, '123.45')
      assert.ok(!JSON.stringify(other).includes('123.45'))
      assert.equal(other.teams[0].stars, 2001)
      const config = structuredClone(state.config)
      config.bonus.bag = [37, 38, 39]
      const control = { requestId: randomUUID(), expectedRevision: state.revision, config }
      await caller.admin.game.startRound({ sessionId: session.id, control })
      await caller.admin.game.startRound({ sessionId: session.id, control })
      state = (await gameplay.adminView(session.id)).state!
      assert.equal((await gameplay.playerView(profiles[0].email)).rules?.bag, 37)
      assert.equal(state.gameStart?.config?.bonus.bag[0], 37)
      const audit = await connection.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id))
      assert.equal(audit.filter(event => event.type === 'team.account_adjusted').length, 1)
      assert.equal(audit.filter(event => event.type === 'config.updated').length, 1)
      const corrected = audit.find(event => event.type === 'team.account_adjusted')!
      assert.deepEqual(corrected.data.before, { balance: '0', stars: 0 })
      assert.deepEqual(corrected.data.after, { balance: '12345', stars: 2001 })
      await gameplay.reset(session.id, actor.id)
      state = (await gameplay.adminView(session.id)).state!
      assert.equal(state.teams[0].balance, '0')
      assert.equal(state.teams[0].stars, 0)
      assert.equal(state.config.bonus.bag[0], 37)
      throw rollback
    })
  } catch (error) { if (error !== rollback) throw error }
})
