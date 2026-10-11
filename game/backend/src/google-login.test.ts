import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import UserRoles from 'supertokens-node/recipe/userroles'
import { isGoogleLoginAllowed } from './supertokens.js'
import { testSessions } from './session-test-fixture.js'

test('Google login only admits verified invited emails or existing admins', async (t) => {
  t.after(() => mock.restoreAll())
  const roles = mock.method(UserRoles, 'getRolesForUser', async () => ({ roles: [] as string[] }))
  assert.equal(await isGoogleLoginAllowed('public', 'user', 'invited@example.com', true, testSessions), true)
  assert.equal(await isGoogleLoginAllowed('public', 'user', 'invited@example.com', false, testSessions), false)
  const unavailable = { ...testSessions, membership: async () => null }
  assert.equal(await isGoogleLoginAllowed('public', 'user', 'outsider@example.com', true, unavailable), false)
  roles.mock.mockImplementation(async () => ({ roles: ['admin'] }))
  assert.equal(await isGoogleLoginAllowed('public', 'admin', 'admin@example.com', true, unavailable), true)
})
