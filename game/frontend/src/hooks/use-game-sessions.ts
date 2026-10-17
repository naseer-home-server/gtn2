import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { trpc } from '@/trpc'

async function refreshSessions() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] }),
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  ])
}
export function useGameSessions() {
  const sessions = useQuery({ queryKey: ['admin', 'sessions'], queryFn: () => trpc.admin.sessions.list.query() })
  const roster = useQuery({ queryKey: ['admin', 'sessions', 'roster'], queryFn: () => trpc.admin.sessions.roster.query() })
  const create = useMutation({ mutationFn: (input: { name: string; rosterIds: string[] }) => trpc.admin.sessions.create.mutate(input), onSuccess: refreshSessions })
  const activate = useMutation({ mutationFn: (id: string | null) => trpc.admin.sessions.setActive.mutate({ id }), onSuccess: refreshSessions })
  return { sessions, roster, create, activate }
}
export function useGameSession(id: string) {
  const session = useQuery({ queryKey: ['admin', 'sessions', id], queryFn: () => trpc.admin.sessions.get.query({ id }) })
  const arrive = useMutation({ mutationFn: (playerId: string) => trpc.admin.sessions.arrive.mutate({ sessionId: id, playerId }), onSuccess: refreshSessions })
  const reorder = useMutation({ mutationFn: (playerIds: string[]) => trpc.admin.sessions.reorder.mutate({ sessionId: id, playerIds }), onSuccess: refreshSessions })
  return { session, arrive, reorder }
}
