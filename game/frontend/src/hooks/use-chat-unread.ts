import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChatInbox } from 'backend/chats'

type ReadPositions = Record<string, number>
function load(key: string): ReadPositions {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    return Object.fromEntries(Object.entries(data).filter(([, value]) => Number.isSafeInteger(value) && Number(value) > 0))
  } catch { return {} }
}
function merge(a: ReadPositions, b: ReadPositions) {
  const result = { ...a }
  for (const [id, sequence] of Object.entries(b)) result[id] = Math.max(result[id] ?? 0, sequence)
  return result
}

/** Browser-local read positions, scoped to both the session and signed-in player.
 * Stores sequence numbers only: no message text or game/account information. */
export function useChatUnread(sessionId: string, playerId: string, conversations: ChatInbox['conversations']) {
  const key = `gtn2:chat-read:v1:${sessionId}:${playerId}`
  const initial = useMemo(() => load(key), [key])
  const [saved, setSaved] = useState({ key, positions: initial })
  const positions = saved.key === key ? saved.positions : initial

  useEffect(() => { setSaved({ key, positions: load(key) }) }, [key])
  useEffect(() => {
    if (saved.key !== key) return
    try { localStorage.setItem(key, JSON.stringify(merge(load(key), saved.positions))) } catch { /* In-memory markers still work if storage is unavailable. */ }
  }, [key, saved])
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return
      setSaved(previous => ({ key, positions: merge(previous.key === key ? previous.positions : {}, load(key)) }))
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [key])

  const markRead = useCallback((conversationId: string, sequence: number) => {
    if (!Number.isSafeInteger(sequence) || sequence <= 0) return
    setSaved(previous => {
      const current = previous.key === key ? previous.positions : load(key)
      if ((current[conversationId] ?? 0) >= sequence) return previous
      return { key, positions: { ...current, [conversationId]: sequence } }
    })
  }, [key])
  const unreadIds = new Set(conversations.filter(conversation =>
    (conversation.lastIncomingSequence ?? 0) > (positions[conversation.id] ?? 0),
  ).map(conversation => conversation.id))
  return { unreadIds, hasUnread: unreadIds.size > 0, markRead }
}
