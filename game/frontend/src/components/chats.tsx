import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Plus, Search, Send, Users, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ChatConversation, ChatInbox } from 'backend/chats'
import { useChatUnread } from '@/hooks/use-chat-unread'
import { useChats, useChatThread } from '@/hooks/use-chats'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatConversationHeader, ChatTranscript } from '@/features/chat/shared-thread'

type Props = {
  sessionId: string
  playerId: string
  mode?: 'floating' | 'page'
  active?: boolean
  onUnreadChange?: (hasUnread: boolean) => void
}
type ComposeMode = 'direct' | 'group' | null

function conversationName(conversation: ChatConversation, inbox: ChatInbox) {
  if (conversation.name) return conversation.name
  const self = inbox.players.find((player) => player.id === inbox.selfPlayerId)
  const otherTeamIds = new Set(inbox.players
    .filter((player) => conversation.playerIds.includes(player.id) && player.id !== inbox.selfPlayerId && player.teamId !== self?.teamId)
    .map((player) => player.teamId)
    .filter((id): id is string => id !== null))
  const names = inbox.teams.filter((team) => otherTeamIds.has(team.id)).map((team) => team.name)
  return names.join(', ') || 'Direct chat'
}

function playerLabel(playerId: string, inbox: ChatInbox) {
  const player = inbox.players.find((item) => item.id === playerId)
  if (!player) return 'Player'
  const team = inbox.teams.find((item) => item.id === player.teamId)
  return team ? `${player.email} · ${team.name}` : player.email
}

function groupPlayerName(player: ChatInbox['players'][number]) {
  return player.firstName?.trim() || player.email.split('@')[0] || 'Player'
}

function groupPlayerLabel(playerId: string, inbox: ChatInbox) {
  const player = inbox.players.find((item) => item.id === playerId)
  if (!player) return 'Player'
  const team = inbox.teams.find((item) => item.id === player.teamId)
  const name = groupPlayerName(player)
  return team ? `${name} · ${team.name}` : name
}

function conversationIdFromPath(pathname: string) {
  const match = pathname.match(/^\/chats\/([^/]+)\/?$/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return null }
}

export function Chats({ sessionId, playerId, mode = 'floating', active = true, onUnreadChange }: Props) {
  const pageMode = mode === 'page'
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [floatingSelectedId, setFloatingSelectedId] = useState<string | null>(null)
  const [composeMode, setComposeMode] = useState<ComposeMode>(null)
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const pendingSend = useRef<{ conversationId: string; text: string; clientMessageId: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const restoreScroll = useRef<{ height: number; top: number } | null>(null)
  const loadingOlderRef = useRef(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderError, setOlderError] = useState<string | null>(null)
  const chats = useChats({ sessionId, playerId, enabled: true })
  const identityRef = useRef({ sessionId, playerId })
  const cachedInbox = chats.inbox.data
  const inbox = cachedInbox?.sessionId === sessionId && cachedInbox.selfPlayerId === playerId ? cachedInbox : undefined
  const conversations = inbox?.conversations ?? []
  const { unreadIds, hasUnread, markRead } = useChatUnread(sessionId, playerId, conversations)
  useEffect(() => { onUnreadChange?.(hasUnread) }, [hasUnread, onUnreadChange])
  const routeSelectedId = pageMode ? conversationIdFromPath(location.pathname) : null
  const selectedId = pageMode ? routeSelectedId : floatingSelectedId
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null
  const draft = selectedId ? drafts[selectedId] ?? '' : ''
  const thread = useChatThread({
    sessionId,
    playerId,
    conversationId: selectedId,
    enabled: pageMode ? active : open,
  })
  const messages = thread.data?.messages ?? []
  const availablePlayers = useMemo(() => inbox?.players.filter((player) => player.id !== inbox.selfPlayerId) ?? [], [inbox])
  const matchingGroupPlayers = availablePlayers.filter((player) => {
    const team = inbox?.teams.find((item) => item.id === player.teamId)
    return `${groupPlayerName(player)} ${team?.name ?? ''}`.toLowerCase().includes(groupSearch.trim().toLowerCase())
  })
  const availableTeams = useMemo(() => inbox?.teams.filter((team) => !team.playerIds.includes(inbox.selfPlayerId)) ?? [], [inbox])

  useEffect(() => {
    if (identityRef.current.sessionId === sessionId && identityRef.current.playerId === playerId) return
    identityRef.current = { sessionId, playerId }
    pendingSend.current = null
    chats.send.reset()
    setDrafts({})
    setFloatingSelectedId(null)
    setComposeMode(null)
    setSelectedPlayers([])
    setGroupName('')
    setOlderError(null)
  }, [sessionId, playerId, chats.send])

  const unresolvedSend = pendingSend.current && (chats.send.isPending || chats.send.isError)
    ? pendingSend.current
    : null

  useEffect(() => {
    if (!pageMode || !active || !unresolvedSend) return
    const threadPath = `/chats/${encodeURIComponent(unresolvedSend.conversationId)}`
    if (location.pathname !== threadPath) navigate(threadPath, { replace: true })
  }, [pageMode, active, unresolvedSend, location.pathname, navigate])

  useLayoutEffect(() => {
    nearBottom.current = true
    restoreScroll.current = null
  }, [selectedId])

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const old = restoreScroll.current
    if (old) {
      element.scrollTop = old.top + element.scrollHeight - old.height
      restoreScroll.current = null
    } else if (nearBottom.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [messages.length, open, active, selectedId])

  const resetCompose = () => {
    setComposeMode(null)
    setSelectedPlayers([])
    setGroupName('')
    setGroupSearch('')
  }
  const goToConversation = (id: string) => {
    if (unresolvedSend && unresolvedSend.conversationId !== id) return
    if (pageMode) navigate(`/chats/${encodeURIComponent(id)}`)
    else setFloatingSelectedId(id)
    nearBottom.current = true
    setOlderError(null)
    resetCompose()
  }
  const backToInbox = () => {
    if (unresolvedSend) return
    if (pageMode) navigate('/chats')
    else setFloatingSelectedId(null)
    setOlderError(null)
  }
  const createDirect = async (teamId: string) => {
    try {
      const conversation = await chats.direct.mutateAsync(teamId)
      goToConversation(conversation.id)
    } catch { /* The mutation error is shown alongside the team list. */ }
  }
  const createGroup = async () => {
    if (!inbox || !groupName.trim() || selectedPlayers.length < 2) return
    try {
      const conversation = await chats.createGroup.mutateAsync({
        name: groupName.trim(),
        playerIds: selectedPlayers,
      })
      goToConversation(conversation.id)
    } catch { /* The mutation error is shown in the group form. */ }
  }
  const openGroupDialog = () => {
    chats.createGroup.reset()
    setGroupSearch('')
    setComposeMode('group')
  }
  const closeGroupDialog = () => {
    if (chats.createGroup.isPending) return
    setComposeMode(null)
    setSelectedPlayers([])
    setGroupName('')
    setGroupSearch('')
    chats.createGroup.reset()
  }
  const submitMessage = () => {
    if (!selected || !draft.trim() || draft.trim().length > 2_000 || chats.send.isPending) return
    const text = draft.trim()
    const request = pendingSend.current ?? {
      conversationId: selected.id,
      text,
      clientMessageId: crypto.randomUUID(),
    }
    if (request.conversationId !== selected.id || request.text !== text) return
    pendingSend.current = request
    nearBottom.current = true
    chats.send.mutate(request, {
      onSuccess: () => {
        if (pendingSend.current?.clientMessageId === request.clientMessageId) {
          pendingSend.current = null
          setDrafts((current) => {
            if (current[request.conversationId]?.trim() !== request.text) return current
            const next = { ...current }
            delete next[request.conversationId]
            return next
          })
        }
      },
    })
  }
  const discardFailedMessage = () => {
    const request = pendingSend.current
    pendingSend.current = null
    chats.send.reset()
    if (request) setDrafts((current) => {
      if (current[request.conversationId]?.trim() !== request.text) return current
      const next = { ...current }
      delete next[request.conversationId]
      return next
    })
  }
  const loadOlder = async () => {
    const element = scrollRef.current
    if (!element || loadingOlderRef.current || thread.isFetching) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    setOlderError(null)
    restoreScroll.current = { height: element.scrollHeight, top: element.scrollTop }
    try {
      await thread.loadOlder()
    } catch (error) {
      restoreScroll.current = null
      setOlderError(error instanceof Error ? error.message : 'Could not load older messages.')
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }

  const panelVisible = pageMode ? active : open
  // A freshly sent reply can enter the cache before a concurrent incoming message.
  // Only advance through incoming messages that were actually displayed.
  const lastDisplayedSequence = messages.filter(message => message.senderPlayerId !== playerId).at(-1)?.sequence ?? 0
  useEffect(() => {
    const readVisibleThread = () => {
      if (panelVisible && selectedId && document.visibilityState === 'visible' && nearBottom.current && !thread.isError && !thread.isLoading) {
        markRead(selectedId, lastDisplayedSequence)
      }
    }
    readVisibleThread()
    document.addEventListener('visibilitychange', readVisibleThread)
    return () => document.removeEventListener('visibilitychange', readVisibleThread)
  }, [panelVisible, selectedId, lastDisplayedSequence, markRead, thread.isError, thread.isLoading])
  const panelClass = pageMode
    ? 'flex h-full min-h-0 w-full flex-col overflow-hidden bg-background'
    : 'fixed right-4 bottom-20 z-50 flex h-[min(38rem,calc(100dvh-7rem))] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl'

  return <>
    {(pageMode || open) && <section id="team-chat-panel" aria-label="Team chat" hidden={!panelVisible} className={`${panelClass} ${pageMode ? `chat-page ${selectedId ? 'chat-page-thread' : 'chat-page-inbox'}` : ''}`}>
      <ChatConversationHeader
        className={pageMode ? 'bg-background' : ''}
        title={selected && inbox ? conversationName(selected, inbox) : 'Chats'}
        titleClassName={pageMode && !selected ? 'chat-page-title' : !pageMode && !selected ? 'section-heading' : ''}
        subtitle={selected?.kind === 'direct' ? 'Direct chat with another team' : selected ? 'Group chat with fixed membership' : 'Players in this game session'}
        leading={selectedId
          ? <Button aria-label="Back to conversations" title={unresolvedSend ? 'Retry or discard the message before switching chats.' : undefined} disabled={Boolean(unresolvedSend)} variant="ghost" size="icon" className="chat-back-button size-11 shrink-0" onClick={backToInbox}><ArrowLeft /></Button>
          : <span className="chat-brand-mark grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><MessageCircle className="size-5" /></span>}
        trailing={<>{!selected && hasUnread && <span className="chat-heading-dot unread-dot" role="img" aria-label="Unread messages" />}{!pageMode && <Button aria-label="Close chats" variant="ghost" size="icon" onClick={() => setOpen(false)}><X /></Button>}</>}
      />
      {unresolvedSend && <p role="status" className="shrink-0 border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground">Retry or discard this message before switching chats. Its message ID stays reserved until the result is confirmed.</p>}

      {!inbox && <div className="p-4 text-base text-muted-foreground">{chats.inbox.isError ? `Could not load chats: ${chats.inbox.error.message}` : 'Loading chats…'}</div>}

      {inbox && !selected && <div className="flex min-h-0 flex-1 flex-col">
        <div className="chat-compose-actions flex shrink-0 gap-2 border-b p-3">
          <Button size="sm" className="chat-action-button min-h-11" variant={composeMode === 'direct' ? 'secondary' : 'outline'} onClick={() => setComposeMode(composeMode === 'direct' ? null : 'direct')}><Plus /> Team chat</Button>
          <Button size="sm" className="chat-action-button min-h-11" variant={composeMode === 'group' ? 'secondary' : 'outline'} onClick={openGroupDialog}><Users /> New group</Button>
        </div>
        {composeMode === 'direct' && <div className="max-h-48 shrink-0 space-y-2 overflow-y-auto border-b p-3">
          <p className="text-sm text-muted-foreground">Start a direct chat with another team</p>
          {availableTeams.length ? availableTeams.map((team) => <Button key={team.id} variant="outline" className="min-h-11 w-full justify-start" disabled={chats.direct.isPending} onClick={() => void createDirect(team.id)}>{team.name}</Button>) : <p className="text-base text-muted-foreground">No other teams are available yet.</p>}
          {chats.direct.isError && <p role="alert" className="text-base text-destructive">{chats.direct.error.message}</p>}
        </div>}
        <div className="chat-conversation-list min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {conversations.length ? conversations.map((conversation) => <button key={conversation.id} disabled={Boolean(unresolvedSend)} className="chat-conversation-row flex min-h-16 w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60" onClick={() => goToConversation(conversation.id)}>
            <span aria-hidden="true" className={`chat-conversation-avatar grid size-11 shrink-0 place-items-center rounded-full ${conversation.kind === 'group' ? 'chat-group-avatar' : ''}`}>{conversation.kind === 'group' ? <Users className="size-5" /> : <MessageCircle className="size-5" />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-base font-semibold">{conversationName(conversation, inbox)}</span>
            <span className="chat-row-preview mt-1 block truncate text-sm text-muted-foreground">{conversation.lastMessage ? `${conversation.lastMessage.senderPlayerId === inbox.selfPlayerId ? 'You: ' : ''}${conversation.lastMessage.text}` : conversation.kind === 'group' ? `${conversation.playerIds.length} members` : 'Start a conversation'}</span></span>
            <span className="chat-row-trailing">{unreadIds.has(conversation.id) && <span className="unread-dot" role="img" aria-label="Unread messages" />}<span className="chat-row-chevron" aria-hidden="true">›</span></span>
          </button>) : <p className="p-4 text-base text-muted-foreground">No conversations yet. Start a team chat or create a group.</p>}
        </div>
      </div>}

      {inbox && selected && <div className="flex min-h-0 flex-1 flex-col">
        <details className="chat-members shrink-0 border-b px-3 py-2 text-base">
          <summary className="min-h-11 cursor-pointer py-2 text-muted-foreground">Members ({selected.playerIds.length})</summary>
          <ul className="max-h-32 space-y-1 overflow-y-auto pb-2 pl-4">
            {selected.playerIds.map((memberId) => <li key={memberId} className="truncate">{memberId === inbox.selfPlayerId ? `You${inbox.teams.find((team) => team.playerIds.includes(memberId)) ? ` · ${inbox.teams.find((team) => team.playerIds.includes(memberId))?.name}` : ''}` : playerLabel(memberId, inbox)}</li>)}
          </ul>
        </details>
        <div ref={scrollRef} className="chat-thread min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3" onScroll={(event) => {
          const element = event.currentTarget
          nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
          if (nearBottom.current && panelVisible && selectedId && document.visibilityState === 'visible' && !thread.isError && !thread.isLoading) markRead(selectedId, lastDisplayedSequence)
        }}>
          {thread.data?.hasOlder && <div className="text-center"><Button variant="ghost" size="sm" className="min-h-11" disabled={loadingOlder || thread.isFetching} onClick={() => void loadOlder()}>{loadingOlder || thread.isFetching ? 'Loading…' : 'Load older messages'}</Button></div>}
          {olderError && <p role="alert" className="text-center text-base text-destructive">Could not load older messages: {olderError}</p>}
          {thread.isError && <p role="alert" className="text-base text-destructive">Could not load messages: {thread.error.message}</p>}
          {!messages.length && !thread.isLoading && (pageMode ? <div className="chat-thread-empty py-8 text-center text-base text-muted-foreground"><span className="chat-empty-icon mx-auto mb-3 grid size-12 place-items-center rounded-full"><MessageCircle className="size-5" /></span><p className="font-medium text-foreground">A fresh conversation</p><p className="mt-1 text-sm">Send the first message to get things started.</p></div> : <p className="py-6 text-center text-base text-muted-foreground">No messages yet. Say hello.</p>)}
          <ChatTranscript
            messages={messages}
            authorFor={(message) => message.senderPlayerId === inbox.selfPlayerId
              ? `You${inbox.teams.find((team) => team.playerIds.includes(inbox.selfPlayerId)) ? ` · ${inbox.teams.find((team) => team.playerIds.includes(inbox.selfPlayerId))?.name}` : ''}`
              : playerLabel(message.senderPlayerId, inbox)}
            sideFor={(message) => message.senderPlayerId === inbox.selfPlayerId ? 'own' : 'other'}
          />
          {thread.isLoading && <p className="text-center text-base text-muted-foreground">Loading messages…</p>}
        </div>
        <div className="chat-composer shrink-0 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2">
            <textarea aria-label="Message" rows={2} maxLength={2_000} value={draft} disabled={chats.send.isPending || chats.send.isError} onChange={(event) => selectedId && setDrafts((current) => ({ ...current, [selectedId]: event.target.value }))} onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitMessage() }
            }} placeholder="Write a message…" className="max-h-32 min-h-12 flex-1 resize-y rounded-md border bg-background px-3 py-2 text-base leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
            <Button aria-label={chats.send.isError ? 'Retry sending message' : 'Send message'} className="size-12 shrink-0" disabled={chats.send.isPending || !draft.trim() || draft.trim().length > 2_000} onClick={submitMessage}>{chats.send.isPending ? '…' : chats.send.isError ? 'Retry' : <Send />}</Button>
          </div>
          <div className="mt-1 flex min-h-8 items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{draft.length}/2000 · Enter to send</span>
            {chats.send.isError && <Button variant="link" size="sm" className="h-auto px-0 text-destructive" onClick={discardFailedMessage}>Discard failed message</Button>}
          </div>
          {chats.send.isError && <p role="alert" className="text-sm text-destructive">Message wasn’t sent: {chats.send.error.message}</p>}
        </div>
      </div>}
    </section>}
    <Dialog.Root open={composeMode === 'group'} onOpenChange={(isOpen) => { if (!isOpen) closeGroupDialog() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay chat-dialog-overlay" />
        <Dialog.Content className="group-chat-dialog" aria-describedby="group-chat-description">
          <div className="group-chat-dialog-heading">
            <div><Dialog.Title className="section-heading">New group chat</Dialog.Title><Dialog.Description id="group-chat-description" className="group-chat-description">Choose 2–13 other invited players. You’ll be included automatically.</Dialog.Description></div>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close group chat" disabled={chats.createGroup.isPending}><X /></Button></Dialog.Close>
          </div>
          <div className="group-chat-fields">
            <div className="space-y-2"><label htmlFor="group-chat-name">Group name</label><Input id="group-chat-name" autoFocus maxLength={60} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Name this conversation" /></div>
            <div className="space-y-2"><label htmlFor="group-chat-search">Find players</label><div className="group-chat-search"><Search aria-hidden="true" /><Input id="group-chat-search" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Search by name or team" /></div></div>
            <div className="group-chat-selected" aria-live="polite">
              <span className="group-chat-chip is-creator"><span>{inbox ? groupPlayerLabel(inbox.selfPlayerId, inbox) : 'You'}</span><small>You · included</small></span>
              {selectedPlayers.map((id) => <button type="button" key={id} className="group-chat-chip" onClick={() => setSelectedPlayers((current) => current.filter((item) => item !== id))} aria-label={`Remove ${inbox ? groupPlayerLabel(id, inbox) : 'player'}`}><span>{inbox ? groupPlayerLabel(id, inbox) : 'Player'}</span><X aria-hidden="true" /></button>)}
            </div>
            <p className="group-chat-count">{selectedPlayers.length + 1} of 14 people selected · choose at least 3 total</p>
            <div className="group-chat-picker" role="group" aria-label="Choose players">
              {matchingGroupPlayers.map((player) => <label key={player.id} className="group-chat-player">
                <input type="checkbox" checked={selectedPlayers.includes(player.id)} disabled={(!selectedPlayers.includes(player.id) && selectedPlayers.length >= 13) || chats.createGroup.isPending} onChange={(event) => setSelectedPlayers((current) => event.target.checked ? [...current, player.id] : current.filter((id) => id !== player.id))} />
                <span><strong>{groupPlayerName(player)}</strong><small>{player.teamId ? inbox?.teams.find((team) => team.id === player.teamId)?.name : 'Invited player'}</small></span>
              </label>)}
              {matchingGroupPlayers.length === 0 && <p className="group-chat-no-results">No players match that search.</p>}
            </div>
            {groupName.trim().length > 60 && <p className="group-chat-validation">Use 60 characters or fewer.</p>}
            {selectedPlayers.length < 2 && <p className="group-chat-guidance">Choose at least two other players.</p>}
            {chats.createGroup.isError && <p role="alert" className="group-chat-error">Could not create the group: {chats.createGroup.error.message} Your choices are still here; try again.</p>}
          </div>
          <div className="group-chat-actions"><Button variant="outline" disabled={chats.createGroup.isPending} onClick={closeGroupDialog}>Cancel</Button><Button className="group-chat-create" disabled={!groupName.trim() || groupName.trim().length > 60 || selectedPlayers.length < 2 || selectedPlayers.length > 13 || chats.createGroup.isPending || !inbox} onClick={() => void createGroup()}>{chats.createGroup.isPending ? 'Creating group…' : 'Create group'}</Button></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {!pageMode && <Button className="fixed right-4 bottom-4 z-50 h-11 rounded-full px-4 shadow-lg" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <MessageCircle /> Chats{hasUnread && <span className="unread-dot floating-unread-dot" role="img" aria-label="Unread messages" />}
    </Button>}
  </>
}
