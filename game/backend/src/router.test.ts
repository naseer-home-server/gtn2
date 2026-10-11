import { testSessions } from './session-test-fixture.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRouter } from './router.js'
import type { AuthUser, Settings, SettingsRepository } from './trpc.js'

const admin: AuthUser = { id: 'admin', email: 'admin@example.com', isAdmin: true, isTestLogin: false }
const player: AuthUser = { ...admin, id: 'player', isAdmin: false }
const testPlayer: AuthUser = { ...player, id: 'test-player', isTestLogin: true }
class MemorySettings implements SettingsRepository {
  private value: Settings = { emailLoginEnabled: false }
  async get() { return { ...this.value } }
  async setEmailLoginEnabled(emailLoginEnabled: boolean) {
    this.value = { emailLoginEnabled }
    return this.get()
  }
}
async function fixture() {
  const settings = new MemorySettings()
  const logins: string[] = []
  const caller = (user: AuthUser | null) => appRouter.createCaller({
    user, settings, sessions: testSessions, signInWithTestEmail: async (email) => { logins.push(email) },
  })
  return { caller, settings, logins }
}

test('guests can read the login setting but cannot access protected/admin procedures', async () => {
  const { caller } = await fixture()
  const guest = caller(null)
  assert.deepEqual(await guest.auth.settings(), { emailLoginEnabled: false })
  assert.equal(await guest.auth.me(), null)
  await assert.rejects(guest.hello(), { code: 'UNAUTHORIZED' })
  await assert.rejects(guest.admin.settings(), { code: 'UNAUTHORIZED' })
  await assert.rejects(guest.admin.setEmailLoginEnabled({ enabled: true }), { code: 'UNAUTHORIZED' })
})
test('normal authenticated users cannot change or read admin settings', async () => {
  const { caller, settings } = await fixture()
  assert.deepEqual(await caller(player).hello(), { message: 'Hello world' })
  await assert.rejects(caller(player).admin.settings(), { code: 'FORBIDDEN' })
  await assert.rejects(caller(player).admin.setEmailLoginEnabled({ enabled: true }), { code: 'FORBIDDEN' })
  assert.equal((await settings.get()).emailLoginEnabled, false)
})
test('admin settings are asynchronously read and updated', async () => {
  const { caller, settings } = await fixture()
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  assert.equal((await settings.get()).emailLoginEnabled, true)
  await caller(admin).admin.setEmailLoginEnabled({ enabled: false })
  assert.equal((await settings.get()).emailLoginEnabled, false)
})
test('disabled email login rejects direct API calls without creating an identity/session', async () => {
  const { caller, logins } = await fixture()
  await assert.rejects(caller(null).auth.testEmailLogin({ email: 'anyone@example.com' }), { code: 'FORBIDDEN' })
  assert.deepEqual(logins, [])
})
test('enabled email login accepts an arbitrary valid email without a password', async () => {
  const { caller, logins } = await fixture()
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  assert.deepEqual(await caller(null).auth.testEmailLogin({ email: '  Any.Team+1@example.com  ' }), { success: true })
  assert.deepEqual(logins, ['any.team+1@example.com'])
})
test('test sessions never get admin access, even with an admin email or role flag', async () => {
  const { caller } = await fixture()
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  const impersonator = caller({ ...admin, isTestLogin: true })
  await assert.rejects(impersonator.admin.settings(), { code: 'FORBIDDEN' })
  await assert.rejects(impersonator.admin.setEmailLoginEnabled({ enabled: false }), { code: 'FORBIDDEN' })
})
test('switching test login off blocks existing test sessions but preserves Google sessions', async () => {
  const { caller } = await fixture()
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  assert.deepEqual(await caller(testPlayer).hello(), { message: 'Hello world' })
  await caller(admin).admin.setEmailLoginEnabled({ enabled: false })
  assert.equal(await caller(testPlayer).auth.me(), null)
  await assert.rejects(caller(testPlayer).hello(), { code: 'UNAUTHORIZED' })
  assert.deepEqual(await caller(player).hello(), { message: 'Hello world' })
})
test('invalid emails and non-boolean settings fail validation', async () => {
  const { caller, logins } = await fixture()
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  await assert.rejects(caller(null).auth.testEmailLogin({ email: 'not-an-email' }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller(admin).admin.setEmailLoginEnabled({ enabled: 'true' as unknown as boolean }), { code: 'BAD_REQUEST' })
  assert.deepEqual(logins, [])
})
test('concurrent updates leave the last persisted value', async () => {
  const { settings } = await fixture()
  await Promise.all([settings.setEmailLoginEnabled(true), settings.setEmailLoginEnabled(false), settings.setEmailLoginEnabled(true)])
  assert.equal((await settings.get()).emailLoginEnabled, true)
})
