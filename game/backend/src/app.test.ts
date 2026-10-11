import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from './app.js'
import { SettingsStore } from './settings.js'
import { initSuperTokens } from './supertokens.js'

// Guest requests must not need a live Core connection or Google credentials.
process.env.APP_URL = 'http://localhost:5173'
process.env.SUPERTOKENS_CONNECTION_URI = 'http://127.0.0.1:1'
process.env.GOOGLE_CLIENT_ID = 'test-client'
process.env.GOOGLE_CLIENT_SECRET = 'test-secret'
process.env.SUPERTOKENS_API_KEY = ''
process.env.SUPERTOKENS_DASHBOARD_ADMINS = ''
initSuperTokens()

test('HTTP routes enforce authentication and do not expose ungated passwordless APIs', async (t) => {
  const settings = new SettingsStore()
  const server = createApp(settings).listen(0, '127.0.0.1')
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  await new Promise<void>((resolve) => server.on('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  const post = (route: string, body: unknown) => fetch(origin + route, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  assert.equal((await fetch(origin + '/health')).status, 200)
  const loginSettings = await fetch(origin + '/trpc/auth.settings')
  assert.deepEqual(await loginSettings.json(), { result: { data: { emailLoginEnabled: false } } })
  assert.equal((await fetch(origin + '/trpc/hello')).status, 401)
  assert.equal((await fetch(origin + '/trpc/admin.settings')).status, 401)
  assert.equal((await post('/trpc/admin.setEmailLoginEnabled', { enabled: true })).status, 401)
  assert.equal((await post('/trpc/auth.testEmailLogin', { email: 'test@example.com' })).status, 403)
  assert.equal((await post('/auth/signinup/code', { email: 'test@example.com' })).status, 404)
  assert.equal((await post('/auth/signinup/code/consume', {})).status, 404)
})
