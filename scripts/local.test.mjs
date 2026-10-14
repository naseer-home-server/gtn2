import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseEnv } from 'node:util'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), 'local.mjs')

async function sandbox(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gtn2-local-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const bin = path.join(dir, 'bin')
  const shared = path.join(dir, 'shared')
  await mkdir(bin)
  await mkdir(path.join(shared, 'game/backend'), { recursive: true })
  await writeFile(path.join(shared, 'game/backend/.env'), 'SUPERTOKENS_API_KEY=shared-test-key\nGOOGLE_CLIENT_SECRET=do-not-inherit\n')
  const log = path.join(dir, 'commands.jsonl')
  for (const name of ['docker', 'pnpm', 'git']) {
    await writeFile(path.join(bin, name), `#!${process.execPath}\nconst fs = require('node:fs');\nif (${JSON.stringify(name)} === 'git') { console.log(${JSON.stringify(path.join(shared, '.git'))}); } else { fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({program:${JSON.stringify(name)},args:process.argv.slice(2),database:process.env.DATABASE_URL,project:process.env.COMPOSE_PROJECT_NAME})+'\\n'); }\n`, { mode: 0o755 })
  }
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, NODE_ENV: 'development' }
  for (const key of ['POSTGRES_PORT', 'BACKEND_PORT', 'FRONTEND_PORT', 'SUPERTOKENS_API_KEY', 'SUPERTOKENS_CONNECTION_URI', 'SUPERTOKENS_DASHBOARD_ADMINS']) delete env[key]
  async function checkout(parent) {
    const root = path.join(dir, parent, 'gtn2')
    await mkdir(path.join(root, 'scripts'), { recursive: true })
    await mkdir(path.join(root, 'game/backend'), { recursive: true })
    await mkdir(path.join(root, 'game/frontend'), { recursive: true })
    await copyFile(source, path.join(root, 'scripts/local.mjs'))
    await writeFile(path.join(root, 'game/backend/.env'), 'SUPERTOKENS_API_KEY=\n')
    await writeFile(path.join(root, '.env'), 'DATABASE_URL=deployment-env-must-survive\n')
    return root
  }
  const run = (root, ...args) => execute(process.execPath, ['scripts/local.mjs', ...args], { cwd: root, env })
  const read = async (root, file) => parseEnv(await readFile(path.join(root, file), 'utf8'))
  return { checkout, env, run, read, log }
}

test('same-basename checkouts use unique Compose projects and preserve local configuration on rerun', async (t) => {
  const fixture = await sandbox(t)
  const first = await fixture.checkout('first')
  const second = await fixture.checkout('second')
  await fixture.run(first, 'setup')
  await fixture.run(second, 'setup')
  const a = await fixture.read(first, '.env.local')
  const b = await fixture.read(second, '.env.local')
  assert.notEqual(a.COMPOSE_PROJECT_NAME, b.COMPOSE_PROJECT_NAME)
  assert.equal(path.basename(first), path.basename(second))
  const backend = await fixture.read(first, 'game/backend/.env')
  assert.equal(backend.DATABASE_URL, `postgresql://gtn2:gtn2@127.0.0.1:${a.POSTGRES_PORT}/gtn2`)
  assert.equal(backend.SUPERTOKENS_API_KEY, 'shared-test-key')
  assert.equal(backend.GOOGLE_CLIENT_SECRET, undefined)
  assert.equal(backend.APP_URL, `http://localhost:${a.FRONTEND_PORT}`)
  assert.equal(backend.PORT, a.BACKEND_PORT)
  assert.equal((await fixture.read(first, 'game/frontend/.env')).BACKEND_PORT, a.BACKEND_PORT)
  assert.equal((await fixture.read(first, '.env')).DATABASE_URL, 'deployment-env-must-survive')
  await fixture.run(first, 'setup')
  assert.deepEqual(await fixture.read(first, '.env.local'), a)
  await fixture.run(first, 'db:seed', '--reset')
  const calls = (await readFile(fixture.log, 'utf8')).trim().split('\n').map(JSON.parse)
  const compose = calls.filter((call) => call.program === 'docker')
  assert.ok(compose.some((call) => call.args.includes(a.COMPOSE_PROJECT_NAME)))
  assert.ok(compose.some((call) => call.args.includes(b.COMPOSE_PROJECT_NAME)))
  assert.ok(compose.every((call) => call.args.includes('--env-file') && call.args.includes('--wait')))
  assert.ok(calls.some((call) => call.program === 'pnpm' && call.args.join(' ') === '--filter backend db:seed --reset' && call.database === backend.DATABASE_URL))
})

test('setup rejects an occupied explicitly requested port and local commands reject production mode', async (t) => {
  const fixture = await sandbox(t)
  const root = await fixture.checkout('occupied')
  const server = net.createServer()
  await new Promise((resolve) => server.listen({ host: '127.0.0.1', port: 0 }, resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const port = server.address().port
  await assert.rejects(execute(process.execPath, ['scripts/local.mjs', 'setup'], { cwd: root, env: { ...fixture.env, FRONTEND_PORT: String(port) } }), (error) => error.stderr.includes('No available local port'))
  await assert.rejects(execute(process.execPath, ['scripts/local.mjs', 'setup'], { cwd: root, env: { ...fixture.env, NODE_ENV: 'production' } }), (error) => error.stderr.includes('cannot run with NODE_ENV=production'))
})
