import { eq } from 'drizzle-orm'
import { appSettings } from './db/schema.js'
import type { AppDb } from './db/index.js'
import type { Settings, SettingsRepository } from './trpc.js'

const settingsId = 'global'

export class DbSettingsRepository implements SettingsRepository {
  constructor(private readonly db: AppDb) {}

  async initialize(): Promise<void> {
    await this.db.insert(appSettings).values({ id: settingsId }).onConflictDoNothing()
  }

  async get(): Promise<Settings> {
    const [row] = await this.db.select({ emailLoginEnabled: appSettings.emailLoginEnabled })
      .from(appSettings).where(eq(appSettings.id, settingsId)).limit(1)
    if (!row) throw new Error('Global app settings row is missing')
    return row
  }

  async setEmailLoginEnabled(enabled: boolean): Promise<Settings> {
    const [row] = await this.db.update(appSettings)
      .set({ emailLoginEnabled: enabled, updatedAt: new Date() })
      .where(eq(appSettings.id, settingsId))
      .returning({ emailLoginEnabled: appSettings.emailLoginEnabled })
    if (!row) throw new Error('Global app settings row is missing')
    return row
  }
}
