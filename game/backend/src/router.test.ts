import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import { appRouter } from './router.js'
import { SettingsStore } from './settings.js'
import type { AuthUser } from './trpc.js'

const admin: AuthUser = { id: 'admin', email: 'admin@example.com', isAdmin: true, isTestLogin: false }
const player: AuthUser = { ...admin, id: 'player', isAdmin: false }
const testPlayer: AuthUser = { ...player, id: 'test-player', isTestLogin: true }
async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtn2-auth-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'settings.json')
  const settings = new SettingsStore(file)
  await settings.load()
  const logins: string[] = []
  const caller = (user: AuthUser | null) => appRouter.createCaller({
    user, settings, signInWithTestEmail: async (email) => { logins.push(email) },
  })
  return { caller, settings, file, logins }
}

test('guests can read the login setting but cannot access protected/admin procedures', async (t) => {
  const { caller } = await fixture(t)
  const guest = caller(null)
  assert.deepEqual(await guest.auth.settings(), { emailLoginEnabled: false })
  assert.equal(await guest.auth.me(), null)
  await assert.rejects(guest.hello(), { code: 'UNAUTHORIZED' })
  await assert.rejects(guest.admin.settings(), { code: 'UNAUTHORIZED' })
  await assert.rejects(guest.admin.setEmailLoginEnabled({ enabled: true }), { code: 'UNAUTHORIZED' })
})
test('normal authenticated users cannot change or read admin settings', async (t) => {
  const { caller, settings } = await fixture(t)
  assert.deepEqual(await caller(player).hello(), { message: 'Hello world' })
  await assert.rejects(caller(player).admin.settings(), { code: 'FORBIDDEN' })
  await assert.rejects(caller(player).admin.setEmailLoginEnabled({ enabled: true }), { code: 'FORBIDDEN' })
  assert.equal(settings.get().emailLoginEnabled, false)
})
test('admin changes survive a new settings-store instance', async (t) => {
  const { caller, file } = await fixture(t)
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  const restarted = new SettingsStore(file)
  await restarted.load()
  assert.equal(restarted.get().emailLoginEnabled, true)
  await caller(admin).admin.setEmailLoginEnabled({ enabled: false })
  await restarted.load()
  assert.equal(restarted.get().emailLoginEnabled, false)
})
test('disabled email login rejects direct API calls without creating an identity/session', async (t) => {
  const { caller, logins } = await fixture(t)
  await assert.rejects(caller(null).auth.testEmailLogin({ email: 'anyone@example.com' }), { code: 'FORBIDDEN' })
  assert.deepEqual(logins, [])
})
test('enabled email login accepts an arbitrary valid email without a password', async (t) => {
  const { caller, logins } = await fixture(t)
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  assert.deepEqual(await caller(null).auth.testEmailLogin({ email: '  Any.Team+1@example.com  ' }), { success: true })
  assert.deepEqual(logins, ['any.team+1@example.com'])
})
test('test sessions never get admin access, even with an admin email or role flag', async (t) => {
  const { caller } = await fixture(t)
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  const impersonator = caller({ ...admin, isTestLogin: true })
  await assert.rejects(impersonator.admin.settings(), { code: 'FORBIDDEN' })
  await assert.rejects(impersonator.admin.setEmailLoginEnabled({ enabled: false }), { code: 'FORBIDDEN' })
})
test('switching test login off blocks existing test sessions but preserves Google sessions', async (t) => {
  const { caller } = await fixture(t)
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  assert.deepEqual(await caller(testPlayer).hello(), { message: 'Hello world' })
  await caller(admin).admin.setEmailLoginEnabled({ enabled: false })
  assert.equal(await caller(testPlayer).auth.me(), null)
  await assert.rejects(caller(testPlayer).hello(), { code: 'UNAUTHORIZED' })
  assert.deepEqual(await caller(player).hello(), { message: 'Hello world' })
})
test('invalid emails and non-boolean settings fail validation', async (t) => {
  const { caller, logins } = await fixture(t)
  await caller(admin).admin.setEmailLoginEnabled({ enabled: true })
  await assert.rejects(caller(null).auth.testEmailLogin({ email: 'not-an-email' }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller(admin).admin.setEmailLoginEnabled({ enabled: 'true' as unknown as boolean }), { code: 'BAD_REQUEST' })
  assert.deepEqual(logins, [])
})
test('concurrent updates persist the last value consistently', async (t) => {
  const { settings, file } = await fixture(t)
  await Promise.all([settings.setEmailLoginEnabled(true), settings.setEmailLoginEnabled(false), settings.setEmailLoginEnabled(true)])
  const restarted = new SettingsStore(file)
  await restarted.load()
  assert.deepEqual(restarted.get(), settings.get())
  assert.equal(restarted.get().emailLoginEnabled, true)
})
