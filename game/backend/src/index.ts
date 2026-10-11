import 'dotenv/config'
import { createApp } from './app.js'
import { SettingsStore } from './settings.js'
import { initSuperTokens, seedRoles } from './supertokens.js'

async function main() {
  initSuperTokens()
  await seedRoles()
  const settings = new SettingsStore()
  const port = Number(process.env.PORT ?? 3000)
  createApp(settings).listen(port, '0.0.0.0', () => console.log(`Game server listening on port ${port}`))
}
main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
