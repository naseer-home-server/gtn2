import { useMemo, useState } from 'react'
import { MessageCircle, Users } from 'lucide-react'
import type { AdminChatAudit, ChatConversation, ChatMessage } from 'backend/chats'
import { ChatConversationHeader, ChatTranscript } from '@/features/chat/shared-thread'
import { formatChatTime } from '@/features/chat/chat-format'

export type { AdminChatAudit }

function conversationTitle(conversation: ChatConversation, audit: AdminChatAudit) {
  if (conversation.name) return conversation.name
  const peers = conversation.playerIds.map((id) => audit.players.find((player) => player.id === id)?.email ?? 'Unknown player')
  return peers.length ? peers.join(' and ') : 'Private team chat'
}

function playerName(playerId: string, audit: AdminChatAudit) {
  const player = audit.players.find((item) => item.id === playerId)
  if (!player) return 'Unknown player'
  return player.email
}

function previewTime(message: ChatMessage | undefined) {
  if (!message) return ''
  const date = new Date(message.createdAt)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function previewText(messages: ChatMessage[]) {
  const latest = messages.at(-1)
  return latest ? `${latest.text}` : 'No messages yet'
}

export function AdminChatAuditViewer({ audit }: { audit: AdminChatAudit }) {
  const conversations = useMemo(() => [...audit.conversations].sort((a, b) => {
    const left = a.messages.at(-1)?.sequence ?? 0
    const right = b.messages.at(-1)?.sequence ?? 0
    return right - left
  }), [audit.conversations])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = conversations.find(({ conversation }) => conversation.id === selectedId) ?? null
  const selectedConversation = selected?.conversation
  const messages = selected?.messages ?? []
  const members = selectedConversation?.playerIds.map((id) => playerName(id, audit)) ?? []
  const title = selectedConversation ? conversationTitle(selectedConversation, audit) : 'Chat rooms'

  if (!conversations.length) return <section className="admin-chat-audit chat-page" aria-label="Host chat review">
    <div className="admin-chat-empty"><MessageCircle aria-hidden="true" /><p>No chat rooms yet.</p><span>Conversations appear here after players start chatting.</span></div>
  </section>

  return <section className={`admin-chat-audit chat-page ${selectedConversation ? 'has-selection' : ''}`} aria-label="Host chat review">
    <aside className="admin-chat-list" aria-label="Conversations">
      <div className="admin-chat-list-heading"><p>Host review</p><h3>Chat rooms</h3><span>{conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}</span></div>
      <div className="admin-chat-conversations">
        {conversations.map(({ conversation, messages: threadMessages }) => {
          const latest = threadMessages.at(-1)
          const selectedRow = selectedConversation?.id === conversation.id
          return <button key={conversation.id} type="button" className={`admin-chat-conversation ${selectedRow ? 'is-selected' : ''}`} aria-current={selectedRow ? 'true' : undefined} onClick={() => setSelectedId(conversation.id)}>
            <span className={`chat-conversation-avatar ${conversation.kind === 'group' ? 'chat-group-avatar' : ''}`} aria-hidden="true">{conversation.kind === 'group' ? <Users /> : <MessageCircle />}</span>
            <span className="admin-chat-conversation-copy"><span className="admin-chat-conversation-title">{conversationTitle(conversation, audit)}</span><span className="admin-chat-preview">{latest ? `${playerName(latest.senderPlayerId, audit)}: ${previewText(threadMessages)}` : previewText(threadMessages)}</span></span>
            <span className="admin-chat-date">{previewTime(latest)}</span>
          </button>
        })}
      </div>
    </aside>

    {selectedConversation ? <div className="admin-chat-thread-panel">
      <button type="button" className="admin-chat-back" onClick={() => setSelectedId(null)}>← All conversations</button>
      <ChatConversationHeader
        className="admin-chat-thread-header"
        title={title}
        subtitle={`${selectedConversation.kind === 'group' ? 'Group conversation' : 'Direct conversation'} · ${members.length} participants`}
        leading={<span aria-hidden="true" className={`chat-conversation-avatar ${selectedConversation.kind === 'group' ? 'chat-group-avatar' : ''}`}>{selectedConversation.kind === 'group' ? <Users /> : <MessageCircle />}</span>}
      />
      <details className="chat-members admin-chat-members">
        <summary>Participants ({members.length})</summary>
        <ul>{members.map((member) => <li key={member}>{member}</li>)}</ul>
      </details>
      <div className="chat-thread admin-chat-thread" aria-label={`Messages in ${title}`}>
        {messages.length ? <ChatTranscript messages={messages} authorFor={(message) => playerName(message.senderPlayerId, audit)} sideFor={() => 'neutral'} /> : <p className="admin-chat-no-messages">No messages yet.</p>}
      </div>
      <div className="admin-chat-readonly">Read-only host view · Updated {messages.at(-1) ? formatChatTime(messages.at(-1)!.createdAt) : 'no messages yet'}</div>
    </div> : <div className="admin-chat-placeholder"><MessageCircle aria-hidden="true" /><p>Choose a conversation to review</p><span>Messages are shown only in the host review.</span></div>}
  </section>
}
