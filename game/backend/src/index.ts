import 'dotenv/config'
import { createApp } from './app.js'
import { closeDb, initDb } from './db/index.js'
import { DbGameSessionsRepository } from './game-sessions.js'
import { DbSettingsRepository } from './db-settings.js'
import { initSuperTokens, seedRoles } from './supertokens.js'

async function main() {
  const db = await initDb()
  const settings = new DbSettingsRepository(db)
  await settings.initialize()
  const sessions = new DbGameSessionsRepository(db)
  initSuperTokens(sessions)
  await seedRoles()
  const port = Number(process.env.PORT ?? 3000)
  const server = createApp(settings, sessions).listen(port, '0.0.0.0', () => console.log(`Game server listening on port ${port}`))
  server.on('close', () => { void closeDb() })
}
main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
