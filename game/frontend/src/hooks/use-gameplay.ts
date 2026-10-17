import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import type { AccountCommand, AdminControl, GameAction, GameConfig, GameId, PlayerGameView, TeamAssignment } from 'backend/game'
import { queryClient } from '@/lib/query-client'
import { trpc } from '@/trpc'

export function isDefiniteActionError(error: unknown) {
  const code = (error as { data?: { code?: string } } | null)?.data?.code
  return ['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'METHOD_NOT_SUPPORTED', 'CONFLICT', 'PRECONDITION_FAILED'].includes(code ?? '')
}

export function usePlayerGame(scope?: { sessionId: string; playerId: string }) {
  const playerKey = ['game', 'player', scope?.sessionId ?? '', scope?.playerId ?? '']
  const state = useQuery({
    queryKey: playerKey,
    queryFn: async () => {
      const view = await trpc.game.state.query()
      if (scope && view.sessionId !== scope.sessionId) throw new Error('Your active session changed. Refresh to rejoin your table.')
      return view
    },
    refetchInterval: (query) => query.state.data?.game === 'cave' ? 1_000 : 2_000,
  })
  const retryCommand = useRef<{ requestId: string; token: string; action: GameAction } | null>(null)
  const action = useMutation({
    mutationFn: (command: { requestId: string; token: string; action: GameAction }) => trpc.game.action.mutate(command),
    onSuccess: async (view) => {
      retryCommand.current = null
      // A delayed poll must not restore an acknowledged rank snapshot or stale balance.
      await queryClient.cancelQueries({ queryKey: playerKey })
      queryClient.setQueryData<PlayerGameView>(playerKey, view)
    },
  })
  const blockedByUncertainTransfer = Boolean(
    action.isError
    && ['money.transfer', 'stars.transfer'].includes(retryCommand.current?.action.type ?? '')
    && !isDefiniteActionError(action.error),
  )
  return {
    state,
    action,
    blockedByUncertainTransfer,
    submit: (next: GameAction) => {
      if (blockedByUncertainTransfer || action.isPending) return
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
    mutationFn: (control: AdminControl | void) => trpc.admin.game.advance.mutate({ sessionId, control: control || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'game', sessionId] }),
  })
  const startRound = useMutation({
    mutationFn: (control: AdminControl | void) => trpc.admin.game.startRound.mutate({ sessionId, control: control || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'game', sessionId] }),
  })
  const reset = useMutation({
    mutationFn: () => trpc.admin.game.reset.mutate({ sessionId }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'game', sessionId] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
    ]),
  })
  const adjustAccount = useMutation({
    mutationFn: (command: AccountCommand) => trpc.admin.game.adjustAccount.mutate({ sessionId, ...command }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'game', sessionId] }),
  })
  return { defaults, state, start, startRound, advance, reset, adjustAccount }
}
