import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid, boolean, uniqueIndex } from 'drizzle-orm/pg-core'

export const gameSessions = pgTable('game_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  currentGame: text('current_game'),
  currentRound: integer('current_round'),
  state: jsonb('state').$type<Record<string, unknown>>().notNull().default({}),
})

export const sessionPlayers = pgTable('session_players', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  arrivalOrder: integer('arrival_order'),
}, (table) => [
  uniqueIndex('session_player_email_idx').on(table.sessionId, table.email),
  uniqueIndex('session_player_arrival_idx').on(table.sessionId, table.arrivalOrder),
  check('session_player_arrival_positive', sql`${table.arrivalOrder} > 0`),
])

export const sessionEvents = pgTable('session_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull(),
  type: text('type').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('session_event_history_idx').on(table.sessionId, table.createdAt)])

export const appSettings = pgTable('app_settings', {
  id: text('id').primaryKey(),
  activeGameSessionId: uuid('active_game_session_id').references(() => gameSessions.id),
  emailLoginEnabled: boolean('email_login_enabled').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type AppSettingsRow = typeof appSettings.$inferSelect
