import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const appSettings = pgTable('app_settings', {
  id: text('id').primaryKey(),
  emailLoginEnabled: boolean('email_login_enabled').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AppSettingsRow = typeof appSettings.$inferSelect
