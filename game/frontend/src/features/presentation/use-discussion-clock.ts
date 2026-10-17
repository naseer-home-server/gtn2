import { useEffect, useState } from 'react'
import type { GameId } from 'backend/game'
import { clockRemaining, type DiscussionClock } from './stage-model'
import { usePresentationStage } from './use-presentation-stage'
import { useStageStorage } from './use-stage-storage'
const freshClock: DiscussionClock = { remainingMs: 600_000, endsAt: null }
export function useDiscussionClock(game: GameId, round: number, autoStart: boolean) {
  const { state } = usePresentationStage()
  const key = `gtn-stage-clock:${state.data?.sessionId ?? 'none'}:${game}:${round}`
  const [clock, update] = useStageStorage(key, freshClock)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(interval) }, [])
  const hasSession = Boolean(state.data)
  useEffect(() => {
    if (!autoStart || !hasSession) return
    try {
      const cached = localStorage.getItem(key)
      if (cached) {
        const previous = JSON.parse(cached) as DiscussionClock
        if (previous.endsAt !== null || previous.remainingMs !== 600_000) return
      }
    } catch { /* Start this tab even when persistent storage is unavailable. */ }
    update({ remainingMs: 600_000, endsAt: Date.now() + 600_000 })
  }, [autoStart, key, hasSession, update])
  const remaining = clockRemaining(clock, now)
  return { remaining, running: clock.endsAt !== null && remaining > 0, toggle: () => update(clock.endsAt === null ? { remainingMs: remaining, endsAt: Date.now() + remaining } : { remainingMs: remaining, endsAt: null }), reset: () => update({ remainingMs: 600_000, endsAt: null }) }
}
