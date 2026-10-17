import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatInbox, ChatMessage } from 'backend/chats'
import { useChatUnread } from './use-chat-unread'

type Conversation = ChatInbox['conversations'][number]

function conversation(id: string, lastIncomingSequence: number | null, lastMessage: ChatMessage | null = null): Conversation {
  return {
    id, kind: 'direct', name: `Chat ${id}`, playerIds: ['player-1', 'player-2'],
    createdAt: '2026-10-16T12:00:00.000Z', lastMessage, lastIncomingSequence,
  }
}

function ownMessage(conversationId: string, sequence: number): ChatMessage {
  return {
    id: `message-${sequence}`, sequence, conversationId, senderPlayerId: 'player-1',
    clientMessageId: `client-${sequence}`, text: 'My latest reply', createdAt: '2026-10-16T12:01:00.000Z',
  }
}

function storageKey(sessionId = 'session-1', playerId = 'player-1') {
  return `gtn2:chat-read:v1:${sessionId}:${playerId}`
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('useChatUnread', () => {
  it('uses incoming metadata when the latest preview is the player’s own message', () => {
    const thread = conversation('thread-a', 4, ownMessage('thread-a', 5))
    const { result } = renderHook(() => useChatUnread('session-1', 'player-1', [thread]))

    expect(result.current.hasUnread).toBe(true)
    expect(result.current.unreadIds.has('thread-a')).toBe(true)
    act(() => result.current.markRead('thread-a', 4))
    expect(result.current.hasUnread).toBe(false)
  })

  it('marks only the displayed incoming sequence and leaves a newer inbox sequence unread', () => {
    const { result, rerender } = renderHook(
      ({ latest }: { latest: number }) => useChatUnread('session-1', 'player-1', [conversation('thread-a', latest)]),
      { initialProps: { latest: 12 } },
    )

    act(() => result.current.markRead('thread-a', 11))
    expect(result.current.unreadIds.has('thread-a')).toBe(true)
    act(() => result.current.markRead('thread-a', 12))
    expect(result.current.hasUnread).toBe(false)

    rerender({ latest: 13 })
    expect(result.current.unreadIds.has('thread-a')).toBe(true)
  })

  it('tracks conversations independently and restores read positions only for the same session and player', () => {
    const conversations = [conversation('thread-a', 3), conversation('thread-b', 8)]
    const first = renderHook(() => useChatUnread('session-1', 'player-1', conversations))
    act(() => first.result.current.markRead('thread-a', 3))
    expect(first.result.current.unreadIds.has('thread-a')).toBe(false)
    expect(first.result.current.unreadIds.has('thread-b')).toBe(true)
    first.unmount()

    const remounted = renderHook(() => useChatUnread('session-1', 'player-1', conversations))
    expect(remounted.result.current.unreadIds.has('thread-a')).toBe(false)
    expect(remounted.result.current.unreadIds.has('thread-b')).toBe(true)
    remounted.unmount()

    const anotherSession = renderHook(() => useChatUnread('session-2', 'player-1', conversations))
    expect(anotherSession.result.current.unreadIds.has('thread-a')).toBe(true)
    anotherSession.unmount()
    const anotherPlayer = renderHook(() => useChatUnread('session-1', 'player-2', conversations))
    expect(anotherPlayer.result.current.unreadIds.has('thread-a')).toBe(true)
  })

  it('ignores malformed stored data and continues with an in-memory read marker', () => {
    localStorage.setItem(storageKey(), '["not", "a", "read-position-map"]')
    const { result } = renderHook(() => useChatUnread('session-1', 'player-1', [conversation('thread-a', 2)]))

    expect(result.current.hasUnread).toBe(true)
    act(() => result.current.markRead('thread-a', 2))
    expect(result.current.hasUnread).toBe(false)
  })

  it('keeps read state usable when browser storage access is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage disabled') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled') })
    const { result } = renderHook(() => useChatUnread('session-1', 'player-1', [conversation('thread-a', 2)]))

    expect(result.current.hasUnread).toBe(true)
    act(() => result.current.markRead('thread-a', 2))
    expect(result.current.hasUnread).toBe(false)
  })

  it('updates read positions from a matching cross-tab storage event', () => {
    const conversations = [conversation('thread-a', 3), conversation('thread-b', 5)]
    const { result } = renderHook(() => useChatUnread('session-1', 'player-1', conversations))
    expect(result.current.hasUnread).toBe(true)

    localStorage.setItem(storageKey(), JSON.stringify({ 'thread-a': 3, 'thread-b': 5 }))
    act(() => window.dispatchEvent(new StorageEvent('storage', {
      key: storageKey(), newValue: JSON.stringify({ 'thread-a': 3, 'thread-b': 5 }),
    })))

    expect(result.current.hasUnread).toBe(false)
    expect(result.current.unreadIds.size).toBe(0)
  })
})
