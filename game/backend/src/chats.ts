import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { MAX_SESSION_PLAYERS } from './engine/limits.js'
import type { AppDb } from './db/index.js'
import { appSettings, chatConversationMembers, chatConversations, chatMessages, gameSessions, sessionPlayers } from './db/schema.js'
import type { AdminChatAudit, ChatConversation, ChatInbox, ChatMessage, ChatMessagePage, ChatPlayer, ChatTeam, ChatsRepository } from './chat-types.js'

type Tx = Parameters<Parameters<AppDb['transaction']>[0]>[0]
type SessionRow = typeof gameSessions.$inferSelect
type PlayerRow = typeof sessionPlayers.$inferSelect
type TeamState = { id: string; name: string; playerIds: string[] }
type ActiveParticipant = { row: SessionRow; player: PlayerRow; teams: TeamState[] }

const badRequest = (message: string): never => { throw new TRPCError({ code: 'BAD_REQUEST', message }) }
const forbidden = (message: string): never => { throw new TRPCError({ code: 'FORBIDDEN', message }) }
const notFound = (): never => { throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' }) }
const conflict = (): never => { throw new TRPCError({ code: 'CONFLICT', message: 'This message ID was already used with different text.' }) }

function teamsFromState(state: Record<string, unknown>): TeamState[] {
  if (!Array.isArray(state.teams)) return []
  return state.teams.flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    const team = value as Record<string, unknown>
    if (typeof team.id !== 'string' || typeof team.name !== 'string' || !Array.isArray(team.playerIds) || !team.playerIds.every((id) => typeof id === 'string')) return []
    return [{ id: team.id, name: team.name, playerIds: team.playerIds as string[] }]
  })
}

async function activeParticipant(tx: Tx, email: string): Promise<ActiveParticipant> {
  const [settings] = await tx.select().from(appSettings).where(eq(appSettings.id, 'global')).for('share')
  const activeSessionId = settings?.activeGameSessionId
  if (!activeSessionId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No game session is active.' })
  const [row] = await tx.select().from(gameSessions).where(eq(gameSessions.id, activeSessionId))
  if (!row) forbidden('No game session is active.')
  const [player] = await tx.select().from(sessionPlayers).where(and(
    eq(sessionPlayers.sessionId, row.id),
    eq(sessionPlayers.email, email.trim().toLowerCase()),
  ))
  if (!player) forbidden('Your email is not invited to the active session.')
  return { row, player, teams: teamsFromState(row.state) }
}

function toMessage(row: typeof chatMessages.$inferSelect): ChatMessage {
  return { id: row.id, sequence: row.sequence, conversationId: row.conversationId,
    senderPlayerId: row.senderPlayerId, clientMessageId: row.clientMessageId,
    text: row.text, createdAt: row.createdAt.toISOString() }
}

async function conversationFor(tx: Tx, id: string, lastMessage: ChatMessage | null = null): Promise<ChatConversation> {
  const [row] = await tx.select().from(chatConversations).where(eq(chatConversations.id, id))
  if (!row) notFound()
  const members = await tx.select({ playerId: chatConversationMembers.playerId }).from(chatConversationMembers)
    .where(eq(chatConversationMembers.conversationId, id))
    .orderBy(asc(chatConversationMembers.createdAt), asc(chatConversationMembers.playerId))
  return { id: row.id, kind: row.kind, name: row.name, playerIds: members.map((member) => member.playerId),
    createdAt: row.createdAt.toISOString(), lastMessage }
}

async function lastMessageFor(tx: Tx, conversationId: string): Promise<ChatMessage | null> {
  const [row] = await tx.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.sequence)).limit(1)
  return row ? toMessage(row) : null
}

async function requireConversationMember(tx: Tx, sessionId: string, playerId: string, conversationId: string) {
  const [row] = await tx.select({ id: chatConversations.id }).from(chatConversations)
    .innerJoin(chatConversationMembers, eq(chatConversationMembers.conversationId, chatConversations.id))
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.sessionId, sessionId), eq(chatConversationMembers.playerId, playerId)))
  if (!row) notFound()
}

export class DbChatsRepository implements ChatsRepository {
  constructor(private readonly db: AppDb) {}

  async inbox(email: string): Promise<ChatInbox> {
    return this.db.transaction(async (tx) => {
      const { row, player, teams } = await activeParticipant(tx, email)
      const players = await tx.select({ id: sessionPlayers.id, email: sessionPlayers.email }).from(sessionPlayers)
        .where(eq(sessionPlayers.sessionId, row.id)).orderBy(asc(sessionPlayers.email))
      const teamByPlayerId = new Map(teams.flatMap((team) => team.playerIds.map((playerId) => [playerId, team.id] as const)))
      const chatPlayers: ChatPlayer[] = players.map((item) => ({ id: item.id, email: item.email, teamId: teamByPlayerId.get(item.id) ?? null }))
      const chatTeams: ChatTeam[] = teams.map((team) => ({ id: team.id, name: team.name, playerIds: [...team.playerIds] }))
      const conversationRows = await tx.select({ id: chatConversations.id, kind: chatConversations.kind,
        name: chatConversations.name, createdAt: chatConversations.createdAt }).from(chatConversations)
        .innerJoin(chatConversationMembers, eq(chatConversationMembers.conversationId, chatConversations.id))
        .where(and(eq(chatConversations.sessionId, row.id), eq(chatConversationMembers.playerId, player.id)))
        .orderBy(desc(chatConversations.createdAt))
      const conversationIds = conversationRows.map((conversation) => conversation.id)
      const members = conversationIds.length
        ? await tx.select({ conversationId: chatConversationMembers.conversationId, playerId: chatConversationMembers.playerId })
          .from(chatConversationMembers).where(inArray(chatConversationMembers.conversationId, conversationIds))
          .orderBy(asc(chatConversationMembers.createdAt), asc(chatConversationMembers.playerId))
        : []
      const latestMessages = conversationIds.length
        ? await tx.selectDistinctOn([chatMessages.conversationId]).from(chatMessages)
          .where(inArray(chatMessages.conversationId, conversationIds))
          .orderBy(asc(chatMessages.conversationId), desc(chatMessages.sequence))
        : []
      const membersByConversation = new Map<string, string[]>()
      for (const member of members) {
        const conversationMembers = membersByConversation.get(member.conversationId) ?? []
        conversationMembers.push(member.playerId)
        membersByConversation.set(member.conversationId, conversationMembers)
      }
      const messageByConversation = new Map(latestMessages.map((message) => [message.conversationId, toMessage(message)]))
      const conversations: ChatConversation[] = conversationRows.map((conversation) => ({
        id: conversation.id, kind: conversation.kind, name: conversation.name,
        playerIds: membersByConversation.get(conversation.id) ?? [], createdAt: conversation.createdAt.toISOString(),
        lastMessage: messageByConversation.get(conversation.id) ?? null,
      }))
      return { sessionId: row.id, selfPlayerId: player.id, players: chatPlayers, teams: chatTeams, conversations }
    })
  }

  async adminAudit(sessionId: string): Promise<AdminChatAudit> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx.select().from(gameSessions).where(eq(gameSessions.id, sessionId))
      if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Game session not found.' })
      const players = await tx.select({ id: sessionPlayers.id, email: sessionPlayers.email }).from(sessionPlayers)
        .where(eq(sessionPlayers.sessionId, sessionId)).orderBy(asc(sessionPlayers.email))
      const teamsByPlayer = new Map(teamsFromState(session.state).flatMap((team) => team.playerIds.map((id) => [id, team.id] as const)))
      const conversations = await tx.select({ id: chatConversations.id, kind: chatConversations.kind,
        name: chatConversations.name, createdAt: chatConversations.createdAt }).from(chatConversations)
        .where(eq(chatConversations.sessionId, sessionId)).orderBy(desc(chatConversations.createdAt))
      const ids = conversations.map(({ id }) => id)
      const [members, messages] = ids.length ? await Promise.all([
        tx.select({ conversationId: chatConversationMembers.conversationId, playerId: chatConversationMembers.playerId })
          .from(chatConversationMembers).where(inArray(chatConversationMembers.conversationId, ids))
          .orderBy(asc(chatConversationMembers.createdAt), asc(chatConversationMembers.playerId)),
        tx.select().from(chatMessages).where(inArray(chatMessages.conversationId, ids))
          .orderBy(asc(chatMessages.sequence)),
      ]) : [[], []]
      const membersByConversation = new Map<string, string[]>()
      for (const member of members) membersByConversation.set(member.conversationId,
        [...(membersByConversation.get(member.conversationId) ?? []), member.playerId])
      const messagesByConversation = new Map<string, ChatMessage[]>()
      for (const row of messages) messagesByConversation.set(row.conversationId,
        [...(messagesByConversation.get(row.conversationId) ?? []), toMessage(row)])
      return {
        sessionId,
        players: players.map((player) => ({ ...player, teamId: teamsByPlayer.get(player.id) ?? null })),
        conversations: conversations.map((row) => {
          const conversationMessages = messagesByConversation.get(row.id) ?? []
          return {
            conversation: { id: row.id, kind: row.kind, name: row.name,
              playerIds: membersByConversation.get(row.id) ?? [], createdAt: row.createdAt.toISOString(),
              lastMessage: conversationMessages.at(-1) ?? null },
            messages: conversationMessages,
          }
        }),
      }
    })
  }

  async direct(email: string, teamId: string): Promise<ChatConversation> {
    return this.db.transaction(async (tx) => {
      const { row, player, teams } = await activeParticipant(tx, email)
      const ownTeam = teams.find((team) => team.playerIds.includes(player.id))
      const targetTeam = teams.find((team) => team.id === teamId)
      if (!ownTeam) throw new TRPCError({ code: 'BAD_REQUEST', message: 'You must be assigned to a team before starting a direct chat.' })
      if (!targetTeam || targetTeam.id === ownTeam.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose another current team for a direct chat.' })
      const directKey = [ownTeam.id, targetTeam.id].sort().join(':')
      let [conversation] = await tx.select().from(chatConversations).where(and(
        eq(chatConversations.sessionId, row.id), eq(chatConversations.directKey, directKey),
      ))
      if (!conversation) {
        ;[conversation] = await tx.insert(chatConversations).values({
          sessionId: row.id, kind: 'direct', directKey, createdByPlayerId: player.id,
        }).onConflictDoNothing({ target: [chatConversations.sessionId, chatConversations.directKey] }).returning()
        if (!conversation) {
          ;[conversation] = await tx.select().from(chatConversations).where(and(
            eq(chatConversations.sessionId, row.id), eq(chatConversations.directKey, directKey),
          ))
        }
      }
      if (!conversation) throw new Error('Unable to create direct conversation.')
      const playerIds = [...new Set([...ownTeam.playerIds, ...targetTeam.playerIds])]
      await tx.insert(chatConversationMembers).values(playerIds.map((playerId) => ({ conversationId: conversation.id, playerId })))
        .onConflictDoNothing({ target: [chatConversationMembers.conversationId, chatConversationMembers.playerId] })
      return conversationFor(tx, conversation.id, await lastMessageFor(tx, conversation.id))
    })
  }

  async createGroup(email: string, name: string, playerIds: string[]): Promise<ChatConversation> {
    return this.db.transaction(async (tx) => {
      const { row, player } = await activeParticipant(tx, email)
      const normalizedName = typeof name === 'string' ? name.trim() : ''
      if (!normalizedName || normalizedName.length > 60) badRequest('Group names must contain 1 to 60 characters.')
      if (!Array.isArray(playerIds) || playerIds.length < 2 || playerIds.length > MAX_SESSION_PLAYERS - 1) badRequest(`Choose between two and ${MAX_SESSION_PLAYERS - 1} other players for a group chat.`)
      if (new Set(playerIds).size !== playerIds.length) badRequest('Choose each group member once.')
      if (playerIds.includes(player.id)) badRequest('The group creator is included automatically; choose other players.')
      const ids = [player.id, ...playerIds]
      const invited = await tx.select({ id: sessionPlayers.id }).from(sessionPlayers)
        .where(and(eq(sessionPlayers.sessionId, row.id), inArray(sessionPlayers.id, ids)))
      if (invited.length !== ids.length) badRequest('All group members must be invited to the active session.')
      const [conversation] = await tx.insert(chatConversations).values({
        sessionId: row.id, kind: 'group', name: normalizedName, createdByPlayerId: player.id,
      }).returning()
      await tx.insert(chatConversationMembers).values(ids.map((playerId) => ({ conversationId: conversation.id, playerId })))
      return conversationFor(tx, conversation.id)
    })
  }

  async messages(email: string, conversationId: string, beforeSequence?: number): Promise<ChatMessagePage> {
    return this.db.transaction(async (tx) => {
      const { row, player } = await activeParticipant(tx, email)
      await requireConversationMember(tx, row.id, player.id, conversationId)
      if (beforeSequence !== undefined && (!Number.isSafeInteger(beforeSequence) || beforeSequence < 1)) badRequest('The message cursor must be a positive sequence number.')
      const query = tx.select().from(chatMessages).where(beforeSequence === undefined
        ? eq(chatMessages.conversationId, conversationId)
        : and(eq(chatMessages.conversationId, conversationId), lt(chatMessages.sequence, beforeSequence)))
      const rows = await query.orderBy(desc(chatMessages.sequence)).limit(51)
      const hasMore = rows.length > 50
      return { messages: rows.slice(0, 50).reverse().map(toMessage), hasMore }
    })
  }

  async send(email: string, conversationId: string, text: string, clientMessageId: string): Promise<ChatMessage> {
    return this.db.transaction(async (tx) => {
      const { row, player } = await activeParticipant(tx, email)
      await requireConversationMember(tx, row.id, player.id, conversationId)
      const normalizedText = typeof text === 'string' ? text.trim() : ''
      const normalizedClientId = typeof clientMessageId === 'string' ? clientMessageId.trim() : ''
      if (!normalizedText || normalizedText.length > 2000) badRequest('Messages must contain 1 to 2000 characters.')
      if (!normalizedClientId || normalizedClientId.length > 128) badRequest('Message IDs must contain 1 to 128 characters.')
      const [inserted] = await tx.insert(chatMessages).values({
        conversationId, senderPlayerId: player.id, clientMessageId: normalizedClientId, text: normalizedText,
      }).onConflictDoNothing({ target: [chatMessages.conversationId, chatMessages.senderPlayerId, chatMessages.clientMessageId] }).returning()
      if (inserted) return toMessage(inserted)
      const [previous] = await tx.select().from(chatMessages).where(and(
        eq(chatMessages.conversationId, conversationId), eq(chatMessages.senderPlayerId, player.id),
        eq(chatMessages.clientMessageId, normalizedClientId),
      ))
      if (!previous) throw new Error('Unable to save chat message.')
      if (previous.text !== normalizedText) conflict()
      return toMessage(previous)
    })
  }
}
