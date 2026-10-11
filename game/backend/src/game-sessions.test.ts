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
test('session creation rejects duplicate normalized emails and more than ten attendees', async () => {
  const { caller } = fixture(admin, false)
  await assert.rejects(caller.admin.sessions.create({ name: 'Night', emails: ['A@example.com', ' a@example.com '] }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.admin.sessions.create({ name: 'Night', emails: Array.from({ length: 11 }, (_, i) => `p${i}@example.com`) }), { code: 'BAD_REQUEST' })
})
