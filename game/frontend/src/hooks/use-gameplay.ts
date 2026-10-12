import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import type { GameAction, GameConfig, GameId, PlayerGameView, TeamAssignment } from 'backend/game'
import { queryClient } from '@/lib/query-client'
import { trpc } from '@/trpc'

export function usePlayerGame() {
  const state = useQuery({
    queryKey: ['game', 'player'],
    queryFn: () => trpc.game.state.query(),
    refetchInterval: (query) => query.state.data?.game === 'cave' ? 1_000 : 2_000,
  })
  const retryCommand = useRef<{ requestId: string; token: string; action: GameAction } | null>(null)
  const action = useMutation({
    mutationFn: (command: { requestId: string; token: string; action: GameAction }) => trpc.game.action.mutate(command),
    onSuccess: (view) => {
      retryCommand.current = null
      queryClient.setQueryData<PlayerGameView>(['game', 'player'], view)
    },
  })
  return {
    state,
    action,
    submit: (next: GameAction) => {
      const current = state.data
      if (!current?.token) return
      retryCommand.current = { requestId: crypto.randomUUID(), token: current.token, action: next }
      action.mutate(retryCommand.current)
    },
    retry: () => retryCommand.current && action.mutate(retryCommand.current),
  }
}

export function useAdminGame(sessionId: string) {
  const defaults = useQuery({
    queryKey: ['admin', 'game', 'defaults'],
    queryFn: () => trpc.admin.game.defaults.query(),
  })
  const state = useQuery({
    queryKey: ['admin', 'game', sessionId],
    queryFn: () => trpc.admin.game.state.query({ sessionId }),
    enabled: Boolean(sessionId),
    refetchInterval: 1_000,
  })
  const start = useMutation({
    mutationFn: (input: { teams: TeamAssignment[]; config: GameConfig; startingGame: GameId }) => trpc.admin.game.start.mutate({ sessionId, ...input }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'game', sessionId] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
    ]),
  })
  const advance = useMutation({
    mutationFn: () => trpc.admin.game.advance.mutate({ sessionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'game', sessionId] }),
  })
  const reset = useMutation({
    mutationFn: () => trpc.admin.game.reset.mutate({ sessionId }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'game', sessionId] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
    ]),
  })
  return { defaults, state, start, advance, reset }
}
