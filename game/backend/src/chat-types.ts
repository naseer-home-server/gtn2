export type ChatPlayer = { id: string; email: string; teamId: string | null }
export type ChatTeam = { id: string; name: string; playerIds: string[] }
export type ChatMessage = {
  id: string; sequence: number; conversationId: string; senderPlayerId: string
  clientMessageId: string; text: string; createdAt: string
}
export type ChatConversation = {
  id: string; kind: 'direct' | 'group'; name: string | null; playerIds: string[]
  createdAt: string; lastMessage: ChatMessage | null
}
export type ChatInbox = {
  sessionId: string; selfPlayerId: string; players: ChatPlayer[]; teams: ChatTeam[]
  conversations: ChatConversation[]
}
export type ChatMessagePage = { messages: ChatMessage[]; hasMore: boolean }
export interface ChatsRepository {
  inbox(email: string): Promise<ChatInbox>
  direct(email: string, teamId: string): Promise<ChatConversation>
  createGroup(email: string, name: string, playerIds: string[]): Promise<ChatConversation>
  messages(email: string, conversationId: string, beforeSequence?: number): Promise<ChatMessagePage>
  send(email: string, conversationId: string, text: string, clientMessageId: string): Promise<ChatMessage>
}
