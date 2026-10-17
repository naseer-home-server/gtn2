import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRouter } from './router.js'
import { testSessions } from './session-test-fixture.js'
import type { AuthUser } from './trpc.js'

const player: AuthUser = { id: 'player', email: 'invited@example.com', isAdmin: false, isTestLogin: false }
const admin: AuthUser = { ...player, isAdmin: true }
function fixture(user: AuthUser | null, invited: boolean) {
  const signIns: string[] = []
  const sessions = { ...testSessions, membership: async () => invited ? { sessionId: 'night-1', sessionName: 'Friday', playerId: 'p1' } : null }
  const caller = appRouter.createCaller({ user, sessions, settings: { get: async () => ({ emailLoginEnabled: true }), setEmailLoginEnabled: async (emailLoginEnabled) => ({ emailLoginEnabled }) }, signInWithTestEmail: async (email) => { signIns.push(email) } })
  return { caller, signIns, sessions }
}
test('uninvited users and users with no active membership cannot access game APIs', async () => {
  const { caller } = fixture(player, false)
  await assert.rejects(caller.hello(), { code: 'FORBIDDEN' })
  await assert.rejects(caller.auth.me(), { code: 'FORBIDDEN' })
})
test('invited users resolve their active session, and lose access when it changes', async () => {
  const { caller, sessions } = fixture(player, true)
  assert.deepEqual((await caller.auth.me())?.gameSession, { sessionId: 'night-1', sessionName: 'Friday', playerId: 'p1' })
  sessions.membership = async () => null
  await assert.rejects(caller.hello(), { code: 'FORBIDDEN' })
})
test('email login rejects uninvited emails before issuing a session', async () => {
  const { caller, signIns } = fixture(null, false)
  await assert.rejects(caller.auth.testEmailLogin({ email: 'outsider@example.com' }), { code: 'FORBIDDEN' })
  assert.deepEqual(signIns, [])
})
test('real admins bypass invitations; email test users never bypass them', async () => {
  assert.deepEqual(await fixture(admin, false).caller.admin.sessions.list(), [])
  await assert.rejects(fixture({ ...admin, isTestLogin: true }, false).caller.hello(), { code: 'FORBIDDEN' })
  await assert.rejects(fixture(player, true).caller.admin.sessions.list(), { code: 'FORBIDDEN' })
})
test('session creation uses only the bundled roster and rejects outsiders or duplicates', async () => {
  const { caller, sessions } = fixture(admin, false)
  sessions.create = async (name, emails, _actor, profiles) => ({ id: 'night', name, players: emails.map((email, index) => ({ id: String(index), email, arrivalOrder: null, firstName: profiles?.[index]?.firstName })), createdAt: '', isActive: false, currentGame: null, currentRound: null })
  const roster = await caller.admin.sessions.roster()
  assert.equal(roster.length, 14)
  assert.ok(roster.every(({ id, name, firstName, email }) => id && name && firstName && email))
  const session = await caller.admin.sessions.create({ name: 'Game night', rosterIds: roster.map(({ id }) => id) })
  assert.equal(session.players.length, 14)
  assert.equal(session.players[0].firstName, 'Rakshitha')
  await assert.rejects(caller.admin.sessions.create({ name: 'Night', rosterIds: ['1', '1'] }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.admin.sessions.create({ name: 'Night', rosterIds: ['999'] }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.admin.sessions.create({ name: 'Night', rosterIds: Array.from({ length: 15 }, (_, i) => String(i + 1)) }), { code: 'BAD_REQUEST' })
  await assert.rejects(fixture(player, true).caller.admin.sessions.roster(), { code: 'FORBIDDEN' })
})
