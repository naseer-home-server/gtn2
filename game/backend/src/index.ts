import 'dotenv/config'
import { createApp } from './app.js'
import { closeDb, initDb } from './db/index.js'
import { DbGameSessionsRepository } from './game-sessions.js'
import { DbSettingsRepository } from './db-settings.js'
import { initSuperTokens, seedRoles } from './supertokens.js'
import { DbGameplayRepository } from './gameplay.js'
import { DbChatsRepository } from './chats.js'

async function main() {
  const db = await initDb()
  const settings = new DbSettingsRepository(db)
  await settings.initialize()
  const sessions = new DbGameSessionsRepository(db)
  const gameplay = new DbGameplayRepository(db)
  const chats = new DbChatsRepository(db)
  initSuperTokens(sessions)
  await seedRoles()
  const port = Number(process.env.PORT ?? 3000)
  const server = createApp(settings, sessions, gameplay, chats).listen(port, '0.0.0.0', () => console.log(`Game server listening on port ${port}`))
  let ticking = false
  const timer = setInterval(() => {
    if (ticking) return
    ticking = true
    void gameplay.tick().catch((error: unknown) => console.error('Game timer failed:', error)).finally(() => { ticking = false })
  }, 500)
  timer.unref()
  server.on('close', () => { clearInterval(timer); void closeDb() })
}
main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
