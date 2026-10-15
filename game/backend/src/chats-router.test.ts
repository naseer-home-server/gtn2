import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRouter } from './router.js'
import type { ChatConversation, ChatInbox, ChatMessage, ChatsRepository } from './chat-types.js'
import type { AuthUser, Settings, SettingsRepository } from './trpc.js'
import { testSessions } from './session-test-fixture.js'

const ids = {
  team: '00000000-0000-4000-8000-000000000001',
  conversation: '00000000-0000-4000-8000-000000000002',
  sender: '00000000-0000-4000-8000-000000000003',
  other: '00000000-0000-4000-8000-000000000004',
  message: '00000000-0000-4000-8000-000000000005',
  groupPeer: '00000000-0000-4000-8000-000000000006',
}
const player: AuthUser = { id: 'player-user', email: 'alice@example.test', isAdmin: false, isTestLogin: false }
const conversation: ChatConversation = {
  id: ids.conversation, kind: 'direct', name: null, playerIds: [ids.sender, ids.other],
  createdAt: '2026-01-01T00:00:00.000Z', lastMessage: null,
}
const message: ChatMessage = {
  id: ids.conversation, sequence: 1, conversationId: ids.conversation, senderPlayerId: ids.sender,
  clientMessageId: ids.message, text: 'hello', createdAt: '2026-01-01T00:00:00.000Z',
}

class MemoryChats implements ChatsRepository {
  calls: Array<{ method: string; email: string; args: unknown[] }> = []
  constructor(private readonly selfPlayerId = ids.sender) {}
  async inbox(email: string): Promise<ChatInbox> {
    this.calls.push({ method: 'inbox', email, args: [] })
    return { sessionId: 'session-1', selfPlayerId: this.selfPlayerId, players: [], teams: [], conversations: [conversation] }
  }
  async adminAudit(sessionId: string) {
    this.calls.push({ method: 'adminAudit', email: 'admin', args: [sessionId] })
    return { sessionId, players: [], conversations: [] }
  }
  async direct(email: string, teamId: string) {
    this.calls.push({ method: 'direct', email, args: [teamId] })
    return conversation
  }
  async createGroup(email: string, name: string, playerIds: string[]) {
    this.calls.push({ method: 'createGroup', email, args: [name, playerIds] })
    return { ...conversation, kind: 'group' as const, name, playerIds: [ids.sender, ...playerIds] }
  }
  async messages(email: string, conversationId: string, beforeSequence?: number) {
    this.calls.push({ method: 'messages', email, args: [conversationId, beforeSequence] })
    return { messages: [message], hasMore: false }
  }
  async send(email: string, conversationId: string, text: string, clientMessageId: string) {
    this.calls.push({ method: 'send', email, args: [conversationId, text, clientMessageId] })
    return { ...message, conversationId, text, clientMessageId }
  }
}

class MemorySettings implements SettingsRepository {
  constructor(private enabled = false) {}
  async get(): Promise<Settings> { return { emailLoginEnabled: this.enabled } }
  async setEmailLoginEnabled(enabled: boolean) { this.enabled = enabled; return this.get() }
}

function createCaller(user: AuthUser | null, options: { chats?: ChatsRepository; member?: boolean; memberPlayerId?: string; settings?: SettingsRepository } = {}) {
  const chats = options.chats ?? new MemoryChats(options.memberPlayerId)
  const sessions = {
    ...testSessions,
    membership: async (email: string) => options.member === false ? null : ({ sessionId: 'session-1', sessionName: 'Test night', playerId: options.memberPlayerId ?? ids.sender }),
  }
  return { caller: appRouter.createCaller({ user, chats, sessions, settings: options.settings ?? new MemorySettings(), signInWithTestEmail: async () => undefined }), chats }
}

test('chat routes require an authenticated active-session member and accept non-admin players', async () => {
  const guest = createCaller(null)
  await assert.rejects(guest.caller.chat.inbox(), { code: 'UNAUTHORIZED' })

  const outside = createCaller(player, { member: false })
  await assert.rejects(outside.caller.chat.inbox(), { code: 'FORBIDDEN' })

  const disabledTestLogin = createCaller({ ...player, isTestLogin: true }, { settings: new MemorySettings(false) })
  await assert.rejects(disabledTestLogin.caller.chat.inbox(), { code: 'UNAUTHORIZED' })

  // The invited member ID represents a teammate who arrived after the team leader.
  const member = createCaller(player, { memberPlayerId: ids.other })
  assert.equal((await member.caller.chat.inbox()).selfPlayerId, ids.other)
  assert.equal((member.chats as MemoryChats).calls[0]?.email, player.email)
})

test('chat routes pass validated inputs to the repository', async () => {
  const { caller, chats } = createCaller(player)
  const api = caller.chat
  assert.equal((await api.direct({ teamId: ids.team })).id, ids.conversation)
  assert.equal((await api.createGroup({ name: '  Game plan  ', playerIds: [ids.other, ids.groupPeer] })).name, 'Game plan')
  assert.deepEqual((await api.messages({ conversationId: ids.conversation, beforeSequence: 17 })).messages.map(({ sequence }) => sequence), [1])
  assert.equal((await api.send({ conversationId: ids.conversation, text: ' hello ', clientMessageId: ids.message })).text, 'hello')
  assert.deepEqual((chats as MemoryChats).calls.map(({ method }) => method), ['direct', 'createGroup', 'messages', 'send'])
  assert.deepEqual((chats as MemoryChats).calls.map(({ email }) => email), Array(4).fill(player.email))
})

test('chat routes reject malformed IDs, empty or oversized values, and invalid page cursors', async () => {
  const { caller } = createCaller(player)
  await assert.rejects(caller.chat.direct({ teamId: 'bad-id' }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.chat.messages({ conversationId: 'bad-id' }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.chat.messages({ conversationId: ids.conversation, beforeSequence: 0 }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.chat.send({ conversationId: ids.conversation, text: '   ', clientMessageId: 'id' }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.chat.send({ conversationId: ids.conversation, text: 'x'.repeat(2001), clientMessageId: 'id' }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.chat.send({ conversationId: ids.conversation, text: 'hello', clientMessageId: 'bad-id' }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.chat.createGroup({ name: '   ', playerIds: [ids.other, ids.groupPeer] }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.chat.createGroup({ name: 'x'.repeat(61), playerIds: [ids.other, ids.groupPeer] }), { code: 'BAD_REQUEST' })
  await assert.rejects(caller.chat.createGroup({ name: 'Group', playerIds: [ids.other, ids.other] }), { code: 'BAD_REQUEST' })
})
