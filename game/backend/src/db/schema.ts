import { sql } from 'drizzle-orm'
import { bigserial, check, index, integer, jsonb, pgTable, text, timestamp, uuid, boolean, uniqueIndex } from 'drizzle-orm/pg-core'

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
  sequence: bigserial('sequence', { mode: 'number' }).notNull(),
  sessionId: uuid('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull(),
  type: text('type').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('session_event_history_idx').on(table.sessionId, table.createdAt),
  index('session_event_sequence_idx').on(table.sessionId, table.sequence),
  uniqueIndex('session_event_request_idx').on(table.sessionId, sql`(${table.data}->>'requestId')`).where(sql`${table.type} = 'player.command'`),
])

export const appSettings = pgTable('app_settings', {
  id: text('id').primaryKey(),
  activeGameSessionId: uuid('active_game_session_id').references(() => gameSessions.id),
  emailLoginEnabled: boolean('email_login_enabled').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const chatConversations = pgTable('chat_conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => gameSessions.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<'direct' | 'group'>().notNull(),
  name: text('name'),
  directKey: text('direct_key'),
  createdByPlayerId: uuid('created_by_player_id').notNull().references(() => sessionPlayers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('chat_conversation_kind_valid', sql`${table.kind} in ('direct', 'group')`),
  check('chat_conversation_name_valid', sql`(${table.kind} = 'direct' and ${table.name} is null) or (${table.kind} = 'group' and ${table.name} is not null and length(${table.name}) between 1 and 60)`),
  check('chat_conversation_direct_key_valid', sql`(${table.kind} = 'direct' and ${table.directKey} is not null) or (${table.kind} = 'group' and ${table.directKey} is null)`),
  uniqueIndex('chat_conversation_direct_idx').on(table.sessionId, table.directKey),
  uniqueIndex('chat_conversation_id_session_idx').on(table.id, table.sessionId),
  index('chat_conversation_session_created_idx').on(table.sessionId, table.createdAt),
])

export const chatConversationMembers = pgTable('chat_conversation_members', {
  conversationId: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  playerId: uuid('player_id').notNull().references(() => sessionPlayers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('chat_conversation_member_idx').on(table.conversationId, table.playerId),
  index('chat_member_player_idx').on(table.playerId, table.conversationId),
])

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  senderPlayerId: uuid('sender_player_id').notNull().references(() => sessionPlayers.id, { onDelete: 'cascade' }),
  sequence: bigserial('sequence', { mode: 'number' }).notNull(),
  clientMessageId: text('client_message_id').notNull(),
  text: text('text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('chat_message_text_valid', sql`length(${table.text}) between 1 and 2000`),
  check('chat_message_client_id_valid', sql`length(${table.clientMessageId}) between 1 and 128`),
  uniqueIndex('chat_message_idempotency_idx').on(table.conversationId, table.senderPlayerId, table.clientMessageId),
  index('chat_message_history_idx').on(table.conversationId, table.sequence),
])

export type AppSettingsRow = typeof appSettings.$inferSelect
