import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import SuperTokens from 'supertokens-node'
import Passwordless from 'supertokens-node/recipe/passwordless'
import Session from 'supertokens-node/recipe/session'
import UserRoles from 'supertokens-node/recipe/userroles'
import { makeContext } from './context.js'
import type { SettingsRepository } from './trpc.js'

function settings(enabled: boolean) {
  return { get: async () => ({ emailLoginEnabled: enabled }) } as SettingsRepository
}
function request(testLogin: boolean) {
  return { req: { session: {
    getUserId: () => 'user-id', getTenantId: () => 'public',
    getAccessTokenPayload: () => ({ testLogin }),
  } }, res: {} } as unknown as CreateExpressContextOptions
}
test('context ignores admin roles on test sessions and reads current roles for real sessions', async (t) => {
  t.after(() => mock.restoreAll())
  mock.method(SuperTokens, 'getUser', async () => ({ id: 'user-id', emails: ['admin@example.com'] }))
  const roles = mock.method(UserRoles, 'getRolesForUser', async () => ({ roles: ['admin'] }))
  const context = makeContext(settings(true))
  assert.equal((await context(request(true))).user?.isAdmin, false)
  assert.equal((await context(request(false))).user?.isAdmin, true)
  roles.mock.mockImplementation(async () => ({ roles: [] }))
  assert.equal((await context(request(false))).user?.isAdmin, false)
})
test('test login issues a marked session with the passwordless recipe identity', async (t) => {
  t.after(() => mock.restoreAll())
  const recipeUserId = SuperTokens.convertToRecipeUserId('test-recipe-user')
  const signIn = mock.method(Passwordless, 'signInUp', async () => ({ status: 'OK', recipeUserId }))
  const session = mock.method(Session, 'createNewSession', async () => ({}))
  const options = { req: {}, res: {} } as CreateExpressContextOptions
  const ctx = await makeContext(settings(true))(options)
  await ctx.signInWithTestEmail('admin@example.com')
  assert.deepEqual(signIn.mock.calls[0].arguments, [{ tenantId: 'public', email: 'admin@example.com' }])
  assert.deepEqual(session.mock.calls[0].arguments, [options.req, options.res, 'public', recipeUserId, { testLogin: true }])
})
test('disabling test login during identity creation prevents session issuance', async (t) => {
  t.after(() => mock.restoreAll())
  let enabled = true
  mock.method(Passwordless, 'signInUp', async () => {
    enabled = false
    return { status: 'OK', recipeUserId: SuperTokens.convertToRecipeUserId('test-user') }
  })
  const session = mock.method(Session, 'createNewSession', async () => ({}))
  const store = { get: async () => ({ emailLoginEnabled: enabled }) } as SettingsRepository
  const ctx = await makeContext(store)({ req: {}, res: {} } as CreateExpressContextOptions)
  await assert.rejects(ctx.signInWithTestEmail('test@example.com'), { code: 'FORBIDDEN' })
  assert.equal(session.mock.callCount(), 0)
})
