import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ChatConversation, ChatInbox, ChatMessage, ChatMessagePage } from 'backend/chats'
import { queryClient } from '@/lib/query-client'
import { trpc } from '@/trpc'

type Identity = { sessionId: string | null; playerId: string | null; enabled: boolean }
export type ChatThreadState = { messages: ChatMessage[]; hasOlder: boolean }

const inboxKey = (sessionId: string, playerId: string) => ['chats', 'inbox', sessionId, playerId] as const
const threadKey = (sessionId: string, playerId: string, conversationId: string) => ['chats', 'messages', sessionId, playerId, conversationId] as const

function mergeMessages(...groups: ChatMessage[][]) {
  const bySequence = new Map<number, ChatMessage>()
  for (const group of groups) for (const message of group) bySequence.set(message.sequence, message)
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence)
}

export function useChats({ sessionId, playerId, enabled }: Identity) {
  const canLoad = Boolean(enabled && sessionId && playerId)
  const currentSession = sessionId ?? ''
  const currentPlayer = playerId ?? ''
  const inboxQueryKey = inboxKey(currentSession, currentPlayer)
  const inbox = useQuery({
    queryKey: inboxQueryKey,
    queryFn: async () => {
      const result = await trpc.chat.inbox.query()
      if (result.sessionId !== currentSession || result.selfPlayerId !== currentPlayer) {
        throw new Error('Your game session changed. Refresh the page to load chats again.')
      }
      return result
    },
    enabled: canLoad,
    refetchInterval: canLoad ? 2_000 : false,
  })

  useEffect(() => {
    if (!canLoad) return
    return () => {
      void queryClient.cancelQueries({ queryKey: ['chats', 'messages', currentSession, currentPlayer] })
      queryClient.removeQueries({ queryKey: ['chats', 'messages', currentSession, currentPlayer] })
      queryClient.removeQueries({ queryKey: inboxKey(currentSession, currentPlayer) })
    }
  }, [canLoad, currentPlayer, currentSession])

  const direct = useMutation({
    mutationFn: (teamId: string) => trpc.chat.direct.mutate({ teamId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inboxQueryKey }),
  })
  const createGroup = useMutation({
    mutationFn: (input: { name: string; playerIds: string[] }) => trpc.chat.createGroup.mutate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inboxQueryKey }),
  })
  const send = useMutation({
    mutationFn: (input: { conversationId: string; text: string; clientMessageId: string }) => trpc.chat.send.mutate(input),
    onSuccess: (message) => {
      const key = threadKey(currentSession, currentPlayer, message.conversationId)
      const old = queryClient.getQueryData<ChatThreadState>(key)
      if (old) {
        queryClient.setQueryData<ChatThreadState>(key, {
          ...old,
          messages: mergeMessages(old.messages, [message]),
        })
      } else {
        void queryClient.invalidateQueries({ queryKey: key })
      }
      void queryClient.invalidateQueries({ queryKey: inboxQueryKey })
    },
  })

  return { inbox, direct, createGroup, send }
}

export function useChatThread({ sessionId, playerId, conversationId, enabled }: {
  sessionId: string
  playerId: string
  conversationId: string | null
  enabled: boolean
}) {
  const id = conversationId ?? ''
  const key = threadKey(sessionId, playerId, id)
  const thread = useQuery({
    queryKey: key,
    queryFn: async (): Promise<ChatThreadState> => {
      const old = queryClient.getQueryData<ChatThreadState>(key)
      const newest = await trpc.chat.messages.query({ conversationId: id })
      let collected = [...newest.messages]
      let hasOlder = newest.hasMore
      const oldLatest = old?.messages.at(-1)?.sequence
      let cursor = newest.messages[0]?.sequence
      // If a client was suspended long enough to miss more than one page, walk
      // back until the new range meets the previously cached messages.
      while (oldLatest !== undefined && cursor !== undefined && cursor > oldLatest + 1 && hasOlder) {
        const page: ChatMessagePage = await trpc.chat.messages.query({ conversationId: id, beforeSequence: cursor })
        collected = mergeMessages(collected, page.messages)
        hasOlder = page.hasMore
        const nextCursor = page.messages[0]?.sequence
        if (nextCursor === undefined || nextCursor >= cursor) break
        cursor = nextCursor
      }
      const latestCached = queryClient.getQueryData<ChatThreadState>(key)
      return {
        messages: mergeMessages(latestCached?.messages ?? [], collected),
        hasOlder: latestCached?.hasOlder ?? hasOlder,
      }
    },
    enabled: enabled && Boolean(id),
    staleTime: 0,
    refetchInterval: enabled && Boolean(id) ? 2_000 : false,
  })
  const loadOlder = async () => {
    const oldest = thread.data?.messages[0]?.sequence
    if (oldest === undefined || !thread.data?.hasOlder || thread.isFetching) return
    const page = await trpc.chat.messages.query({ conversationId: id, beforeSequence: oldest })
    queryClient.setQueryData<ChatThreadState>(key, (old) => old ? {
      messages: mergeMessages(page.messages, old.messages),
      hasOlder: page.hasMore,
    } : { messages: page.messages, hasOlder: page.hasMore })
  }
  return { ...thread, loadOlder }
}

export type { ChatConversation, ChatInbox, ChatMessage }
