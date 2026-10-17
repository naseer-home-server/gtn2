import type { ReactNode } from 'react'
import type { ChatMessage } from 'backend/chats'
import { formatChatTime } from './chat-format'

export function ChatConversationHeader({
  title,
  subtitle,
  leading,
  trailing,
  className = '',
  titleClassName = '',
}: {
  title: string
  subtitle?: string
  leading?: ReactNode
  trailing?: ReactNode
  className?: string
  titleClassName?: string
}) {
  return <header className={`chat-page-header flex shrink-0 items-center gap-3 border-b px-4 py-3 ${className}`}>
    {leading}
    <div className="min-w-0 flex-1">
      <h2 className={`chat-conversation-title truncate ${titleClassName}`}>{title}</h2>
      {subtitle && <p className="chat-subtitle truncate text-sm text-muted-foreground">{subtitle}</p>}
    </div>
    {trailing}
  </header>
}

export function ChatMessageRow({
  message,
  author,
  side = 'other',
}: {
  message: Pick<ChatMessage, 'id' | 'text' | 'createdAt'>
  author: string
  side?: 'own' | 'other' | 'neutral'
}) {
  const aligned = side !== 'neutral'
  return <article className={`chat-message-row flex flex-col ${aligned && side === 'own' ? 'items-end' : 'items-start'} ${side === 'neutral' ? 'chat-message-neutral' : ''}`}>
    <div className="chat-message-meta mb-1 flex max-w-[90%] items-center gap-2 text-xs text-muted-foreground">
      <span className="chat-message-author truncate">{author}</span>
      <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time>
    </div>
    <div className={`chat-message-bubble max-w-[90%] rounded-lg px-3 py-2 text-base leading-6 ${side === 'own' ? 'chat-own-message' : 'bg-muted text-foreground'}`}>
      <p className="whitespace-pre-wrap break-words">{message.text}</p>
    </div>
  </article>
}

export function ChatTranscript({
  messages,
  authorFor,
  sideFor,
}: {
  messages: ChatMessage[]
  authorFor: (message: ChatMessage) => string
  sideFor?: (message: ChatMessage) => 'own' | 'other' | 'neutral'
}) {
  return <>{messages.map((message) => <ChatMessageRow key={message.id} message={message} author={authorFor(message)} side={sideFor?.(message) ?? 'neutral'} />)}</>
}
