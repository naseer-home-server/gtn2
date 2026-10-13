import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MessageCircle, Plus, Send, Users, X } from 'lucide-react'
import type { ChatConversation, ChatInbox, ChatMessage } from 'backend/chats'
import { useChats, useChatThread } from '@/hooks/use-chats'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Props = { sessionId: string; playerId: string }
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

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function MessageRow({ message, inbox }: { message: ChatMessage; inbox: ChatInbox }) {
  const own = message.senderPlayerId === inbox.selfPlayerId
  const ownTeam = inbox.teams.find((team) => team.playerIds.includes(inbox.selfPlayerId))
  return <article className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
    <div className="mb-1 flex max-w-[90%] items-center gap-2 text-[11px] text-muted-foreground">
      <span className="truncate">{own ? `You${ownTeam ? ` · ${ownTeam.name}` : ''}` : playerLabel(message.senderPlayerId, inbox)}</span>
      <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
    </div>
    <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${own ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
      <p className="whitespace-pre-wrap break-words">{message.text}</p>
    </div>
  </article>
}

export function Chats({ sessionId, playerId }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composeMode, setComposeMode] = useState<ComposeMode>(null)
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [draft, setDraft] = useState('')
  const pendingSend = useRef<{ conversationId: string; text: string; clientMessageId: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const restoreScroll = useRef<{ height: number; top: number } | null>(null)
  const loadingOlderRef = useRef(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderError, setOlderError] = useState<string | null>(null)
  const chats = useChats({ sessionId, playerId, enabled: true })
  const cachedInbox = chats.inbox.data
  const inbox = cachedInbox?.sessionId === sessionId && cachedInbox.selfPlayerId === playerId ? cachedInbox : undefined
  const conversations = inbox?.conversations ?? []
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null
  const thread = useChatThread({ sessionId, playerId, conversationId: selectedId, enabled: open })
  const messages = thread.data?.messages ?? []
  const availablePlayers = useMemo(() => inbox?.players.filter((player) => player.id !== inbox.selfPlayerId) ?? [], [inbox])
  const availableTeams = useMemo(() => inbox?.teams.filter((team) => !team.playerIds.includes(inbox.selfPlayerId)) ?? [], [inbox])

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
  }, [messages.length, open, selectedId])

  const resetCompose = () => {
    setComposeMode(null)
    setSelectedPlayers([])
    setGroupName('')
  }
  const resetMessageDraft = () => {
    pendingSend.current = null
    chats.send.reset()
    setDraft('')
  }
  const openConversation = (id: string) => {
    setSelectedId(id)
    nearBottom.current = true
    setOlderError(null)
    resetMessageDraft()
    resetCompose()
  }
  const createDirect = async (teamId: string) => {
    try {
      const conversation = await chats.direct.mutateAsync(teamId)
      setSelectedId(conversation.id)
      nearBottom.current = true
      setOlderError(null)
      resetMessageDraft()
      resetCompose()
    } catch { /* The mutation error is shown alongside the team list. */ }
  }
  const createGroup = async () => {
    if (!inbox || !groupName.trim() || selectedPlayers.length < 2) return
    try {
      const conversation = await chats.createGroup.mutateAsync({
        name: groupName.trim(),
        playerIds: selectedPlayers,
      })
      setSelectedId(conversation.id)
      nearBottom.current = true
      setOlderError(null)
      resetMessageDraft()
      resetCompose()
    } catch { /* The mutation error is shown in the group form. */ }
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
          setDraft('')
        }
      },
    })
  }
  const discardFailedMessage = () => {
    pendingSend.current = null
    chats.send.reset()
    setDraft('')
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

  return <>
    {open && <section id="team-chat-panel" aria-label="Team chat" className="fixed right-4 bottom-20 z-50 flex h-[min(38rem,calc(100dvh-7rem))] w-[min(25rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
      <header className="flex items-center gap-2 border-b px-3 py-3">
        {selected ? <Button aria-label="Back to conversations" variant="ghost" size="icon" onClick={() => { setSelectedId(null); setOlderError(null); resetMessageDraft() }}><ArrowLeft /></Button> : <span className="grid size-8 place-items-center rounded-lg bg-muted"><MessageCircle className="size-4" /></span>}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{selected && inbox ? conversationName(selected, inbox) : 'Chats'}</h2>
          <p className="text-xs text-muted-foreground">{selected?.kind === 'direct' ? 'Direct chat shared with both teams' : selected ? 'Group chat with fixed membership' : 'Players in this game session'}</p>
        </div>
        <Button aria-label="Close chats" variant="ghost" size="icon" onClick={() => setOpen(false)}><X /></Button>
      </header>

      {!inbox && <div className="p-4 text-sm text-muted-foreground">{chats.inbox.isError ? `Could not load chats: ${chats.inbox.error.message}` : 'Loading chats…'}</div>}

      {inbox && !selected && <>
        <div className="flex gap-2 border-b p-3">
          <Button size="sm" variant={composeMode === 'direct' ? 'secondary' : 'outline'} onClick={() => setComposeMode(composeMode === 'direct' ? null : 'direct')}><Plus /> Team chat</Button>
          <Button size="sm" variant={composeMode === 'group' ? 'secondary' : 'outline'} onClick={() => setComposeMode(composeMode === 'group' ? null : 'group')}><Users /> New group</Button>
        </div>
        {composeMode === 'direct' && <div className="space-y-2 border-b p-3">
          <p className="text-xs font-medium text-muted-foreground">Start a direct chat with another team</p>
          {availableTeams.length ? availableTeams.map((team) => <Button key={team.id} variant="outline" className="w-full justify-start" disabled={chats.direct.isPending} onClick={() => void createDirect(team.id)}>{team.name}</Button>) : <p className="text-sm text-muted-foreground">No other teams are available yet.</p>}
          {chats.direct.isError && <p role="alert" className="text-sm text-destructive">{chats.direct.error.message}</p>}
        </div>}
        {composeMode === 'group' && <div className="space-y-3 border-b p-3">
          <Input aria-label="Group name" placeholder="Group name" maxLength={60} value={groupName} onChange={(event) => setGroupName(event.target.value)} />
          <p className="text-xs text-muted-foreground">Choose at least two other players. You’ll be included automatically.</p>
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {availablePlayers.map((player) => <label key={player.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" checked={selectedPlayers.includes(player.id)} onChange={(event) => setSelectedPlayers((current) => event.target.checked ? [...current, player.id] : current.filter((id) => id !== player.id))} />
              <span className="truncate">{playerLabel(player.id, inbox)}</span>
            </label>)}
          </div>
          <Button className="w-full" disabled={!groupName.trim() || selectedPlayers.length < 2 || chats.createGroup.isPending} onClick={() => void createGroup()}>{chats.createGroup.isPending ? 'Creating…' : 'Create group'}</Button>
          {chats.createGroup.isError && <p role="alert" className="text-sm text-destructive">{chats.createGroup.error.message}</p>}
        </div>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length ? conversations.map((conversation) => <button key={conversation.id} className="w-full border-b px-4 py-3 text-left hover:bg-muted/70 focus-visible:bg-muted" onClick={() => openConversation(conversation.id)}>
            <span className="block truncate text-sm font-medium">{conversationName(conversation, inbox)}</span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.lastMessage ? `${conversation.lastMessage.senderPlayerId === inbox.selfPlayerId ? 'You: ' : ''}${conversation.lastMessage.text}` : conversation.kind === 'group' ? `${conversation.playerIds.length} members` : 'Start a conversation'}</span>
          </button>) : <p className="p-4 text-sm text-muted-foreground">No conversations yet. Start a team chat or create a group.</p>}
        </div>
      </>}

      {inbox && selected && <>
        <details className="border-b px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Members ({selected.playerIds.length})</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {selected.playerIds.map((memberId) => <li key={memberId} className="truncate">{memberId === inbox.selfPlayerId ? `You${inbox.teams.find((team) => team.playerIds.includes(memberId)) ? ` · ${inbox.teams.find((team) => team.playerIds.includes(memberId))?.name}` : ''}` : playerLabel(memberId, inbox)}</li>)}
          </ul>
        </details>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3" onScroll={(event) => {
          const element = event.currentTarget
          nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
        }}>
          {thread.data?.hasOlder && <div className="text-center"><Button variant="ghost" size="sm" disabled={loadingOlder || thread.isFetching} onClick={() => void loadOlder()}>{loadingOlder || thread.isFetching ? 'Loading…' : 'Load older messages'}</Button></div>}
          {olderError && <p role="alert" className="text-center text-sm text-destructive">Could not load older messages: {olderError}</p>}
          {thread.isError && <p role="alert" className="text-sm text-destructive">Could not load messages: {thread.error.message}</p>}
          {!messages.length && !thread.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>}
          {messages.map((message) => <MessageRow key={message.id} message={message} inbox={inbox} />)}
          {thread.isLoading && <p className="text-center text-sm text-muted-foreground">Loading messages…</p>}
        </div>
        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <textarea aria-label="Message" rows={2} maxLength={2_000} value={draft} disabled={chats.send.isPending || chats.send.isError} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitMessage() }
            }} placeholder="Write a message…" className="max-h-28 min-h-16 flex-1 resize-y rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
            <Button aria-label={chats.send.isError ? 'Retry sending message' : 'Send message'} disabled={chats.send.isPending || !draft.trim() || draft.trim().length > 2_000} onClick={submitMessage}>{chats.send.isPending ? 'Sending…' : chats.send.isError ? 'Retry' : <Send />}</Button>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{draft.length}/2000 · Enter to send</span>
            {chats.send.isError && <Button variant="link" size="sm" className="h-auto px-0 text-destructive" onClick={discardFailedMessage}>Discard failed message</Button>}
          </div>
          {chats.send.isError && <p role="alert" className="mt-1 text-sm text-destructive">Message wasn’t sent: {chats.send.error.message}</p>}
        </div>
      </>}
    </section>}
    <Button className="fixed right-4 bottom-4 z-50 h-11 rounded-full px-4 shadow-lg" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <MessageCircle /> Chats
    </Button>
  </>
}
