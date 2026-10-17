import { useState } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatInbox, ChatMessage } from 'backend/chats'
import { Chats } from './chats'

const { useChatsMock, useChatThreadMock, createGroupAsync, sendRequests, shouldFailNextSend } = vi.hoisted(() => ({
  useChatsMock: vi.fn(),
  useChatThreadMock: vi.fn(),
  createGroupAsync: vi.fn(),
  sendRequests: [] as Array<{ conversationId: string; text: string; clientMessageId: string }>,
  shouldFailNextSend: { value: false },
}))

vi.mock('@/hooks/use-chats', () => ({
  useChats: (...args: unknown[]) => useChatsMock(...args),
  useChatThread: (...args: unknown[]) => useChatThreadMock(...args),
}))

const inbox: ChatInbox = {
  sessionId: 'session-1', selfPlayerId: 'player-1',
  players: [
    { id: 'player-1', email: 'one@example.test', firstName: 'Alex', teamId: 'team-a' },
    { id: 'player-2', email: 'two@example.test', firstName: 'Sam', teamId: 'team-b' },
    { id: 'player-3', email: 'three@example.test', firstName: 'Casey', teamId: null },
    { id: 'player-4', email: 'four@example.test', teamId: null },
  ],
  teams: [
    { id: 'team-a', name: 'Team A', playerIds: ['player-1'] },
    { id: 'team-b', name: 'Team B', playerIds: ['player-2'] },
  ],
  conversations: [{
    id: 'conversation-1', kind: 'direct', name: 'Team B', playerIds: ['player-1', 'player-2'],
    createdAt: '2026-10-16T12:00:00.000Z', lastMessage: null, lastIncomingSequence: null,
  }],
}

let inboxSnapshot = inbox

function NavigationHarness() {
  const [hasUnread, setHasUnread] = useState(false)
  const location = useLocation()
  const chatIsActive = location.pathname.startsWith('/chats')
  return <>
    <nav aria-label="Main navigation">
      <Link to="/wallet">Wallet</Link>
      <Link to="/chats">Chats</Link>
    </nav>
    <p role="status">{hasUnread ? 'Unread chat messages' : 'No unread chat messages'}</p>
    <p aria-label="Current route">{location.pathname}</p>
    <Chats sessionId="session-1" playerId="player-1" mode="page" active={chatIsActive} onUnreadChange={setHasUnread} />
    {location.pathname === '/wallet' && <h1>Wallet destination</h1>}
  </>
}

function TestApp() {
  return <MemoryRouter initialEntries={['/chats']}><NavigationHarness /></MemoryRouter>
}

beforeEach(() => {
  inboxSnapshot = inbox
  localStorage.clear()
  sendRequests.length = 0
  createGroupAsync.mockReset()
  shouldFailNextSend.value = false
  useChatsMock.mockImplementation(() => {
    const [sendStatus, setSendStatus] = useState<'idle' | 'pending' | 'error'>('idle')
    const send = {
      isPending: sendStatus === 'pending',
      isError: sendStatus === 'error',
      error: sendStatus === 'error' ? new Error('Network connection interrupted') : null,
      mutate: (request: { conversationId: string; text: string; clientMessageId: string }, options?: { onSuccess?: (message: ChatMessage) => void }) => {
        sendRequests.push(request)
        if (shouldFailNextSend.value) {
          shouldFailNextSend.value = false
          setSendStatus('error')
          return
        }
        setSendStatus('pending')
        setTimeout(() => {
          setSendStatus('idle')
          options?.onSuccess?.({
            id: `message-${sendRequests.length}`, sequence: sendRequests.length,
            conversationId: request.conversationId, senderPlayerId: 'player-1',
            clientMessageId: request.clientMessageId, text: request.text,
            createdAt: '2026-10-16T12:01:00.000Z',
          })
        }, 0)
      },
      reset: () => setSendStatus('idle'),
    }
    return {
      inbox: { data: inboxSnapshot, isError: false, error: null },
      direct: { isPending: false, isError: false, error: null, mutateAsync: vi.fn() },
      createGroup: { isPending: false, isError: false, error: null, mutateAsync: createGroupAsync, reset: vi.fn() },
      send,
    }
  })
  useChatThreadMock.mockReturnValue({
    data: { messages: [], hasOlder: false }, isFetching: false, isError: false,
    isLoading: false, error: null, loadOlder: vi.fn(),
  })
})

afterEach(cleanup)

describe('Chats navigation state', () => {
  it('keeps an ordinary message draft when leaving the thread for Wallet and returning through the inbox', async () => {
    const user = userEvent.setup()
    render(<TestApp />)

    await user.click(await screen.findByRole('button', { name: /Team B/ }))
    const message = await screen.findByRole('textbox', { name: 'Message' })
    await user.type(message, 'We should hold our choice until the final seconds.')

    await user.click(screen.getByRole('link', { name: 'Wallet' }))
    await screen.findByRole('heading', { name: 'Wallet destination' })
    await user.click(screen.getByRole('link', { name: 'Chats' }))
    await user.click(await screen.findByRole('button', { name: /Team B/ }))

    expect((await screen.findByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value)
      .toBe('We should hold our choice until the final seconds.')
  })

  it('preserves the failed message ID and text across top-level navigation, blocks Back, and retries that request', async () => {
    const user = userEvent.setup()
    shouldFailNextSend.value = true
    render(<TestApp />)

    await user.click(await screen.findByRole('button', { name: /Team B/ }))
    await user.type(await screen.findByRole('textbox', { name: 'Message' }), 'Keep the original message ID.')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByRole('alert')
    const firstRequest = sendRequests[0]

    await user.click(screen.getByRole('link', { name: 'Wallet' }))
    await screen.findByRole('heading', { name: 'Wallet destination' })
    await user.click(screen.getByRole('link', { name: 'Chats' }))
    await waitFor(() => expect(screen.getByLabelText('Current route').textContent).toBe('/chats/conversation-1'))

    const back = screen.getByRole('button', { name: 'Back to conversations' })
    expect((back as HTMLButtonElement).disabled).toBe(true)
    await user.click(back)
    expect(screen.getByLabelText('Current route').textContent).toBe('/chats/conversation-1')
    expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value)
      .toBe('Keep the original message ID.')

    await user.click(screen.getByRole('button', { name: 'Retry sending message' }))
    await waitFor(() => expect(sendRequests).toHaveLength(2))
    expect(sendRequests[1]).toEqual(firstRequest)
    expect(sendRequests[1]).toMatchObject({
      conversationId: 'conversation-1', text: 'Keep the original message ID.',
      clientMessageId: expect.any(String),
    })
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe(''))
  })
})

describe('group chat creation', () => {
  it('searches peers, includes the creator, and submits the selected players', async () => {
    const user = userEvent.setup()
    createGroupAsync.mockResolvedValue({
      id: 'group-1', kind: 'group', name: 'Table talk', playerIds: ['player-1', 'player-2', 'player-3'],
      createdAt: '2026-10-17T00:00:00.000Z', lastMessage: null,
    })
    render(<TestApp />)

    await user.click(await screen.findByRole('button', { name: /New group/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New group chat' })
    expect(within(dialog).getByText('You · included')).toBeTruthy()
    expect(within(dialog).getByText('Alex · Team A')).toBeTruthy()
    expect(within(dialog).queryByText(/@example.test/)).toBeNull()
    expect(within(dialog).getByRole('checkbox', { name: /four/ })).toBeTruthy()
    await user.type(within(dialog).getByRole('textbox', { name: 'Group name' }), 'Table talk')
    await user.type(within(dialog).getByRole('textbox', { name: 'Find players' }), 'Casey')
    await user.click(within(dialog).getByRole('checkbox', { name: /Casey/ }))
    await user.clear(within(dialog).getByRole('textbox', { name: 'Find players' }))
    await user.click(within(dialog).getByRole('checkbox', { name: /Sam/ }))

    expect(within(dialog).getByRole('button', { name: 'Remove Sam · Team B' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Remove Casey' })).toBeTruthy()
    expect(within(dialog).getByText('3 of 14 people selected · choose at least 3 total')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Create group' }))
    await waitFor(() => expect(createGroupAsync).toHaveBeenCalledWith({
      name: 'Table talk', playerIds: ['player-3', 'player-2'],
    }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New group chat' })).toBeNull())
  })

  it('clears selected people when the creator cancels and reopens the picker', async () => {
    const user = userEvent.setup()
    render(<TestApp />)

    await user.click(await screen.findByRole('button', { name: /New group/ }))
    let dialog = await screen.findByRole('dialog', { name: 'New group chat' })
    await user.click(within(dialog).getByRole('checkbox', { name: /Sam/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: /New group/ }))
    dialog = await screen.findByRole('dialog', { name: 'New group chat' })
    expect(within(dialog).getByText('1 of 14 people selected · choose at least 3 total')).toBeTruthy()
    expect((within(dialog).getByRole('checkbox', { name: /Sam/ }) as HTMLInputElement).checked).toBe(false)
  })
})


it('keeps a notification until the received message is displayed in its conversation', async () => {
  const user = userEvent.setup()
  inboxSnapshot = { ...inbox, conversations: [{ ...inbox.conversations[0], lastIncomingSequence: 3 }] }
  const olderMessage: ChatMessage = { id: 'older', sequence: 2, conversationId: 'conversation-1', senderPlayerId: 'player-2', clientMessageId: 'old-id', text: 'Earlier message', createdAt: '2026-10-17T00:00:00Z' }
  const ownReply = { ...olderMessage, id: 'reply', sequence: 4, senderPlayerId: 'player-1', text: 'My reply' }
  useChatThreadMock.mockReturnValue({ data: { messages: [olderMessage, ownReply], hasOlder: false }, isError: false, isLoading: false, loadOlder: vi.fn() })
  const { rerender } = render(<TestApp />)
  await screen.findByText('Unread chat messages', { exact: true })
  await user.click(screen.getByRole('link', { name: 'Wallet' }))
  expect(screen.getByText('Unread chat messages', { exact: true })).toBeTruthy()
  await user.click(screen.getByRole('link', { name: 'Chats' }))
  await user.click(screen.getByRole('button', { name: /Team B/ }))
  await screen.findByText('Earlier message')
  expect(screen.getByText('Unread chat messages', { exact: true })).toBeTruthy()

  useChatThreadMock.mockReturnValue({ data: { messages: [olderMessage, { ...olderMessage, id: 'new', sequence: 3, text: 'Newest message' }, ownReply], hasOlder: false }, isError: false, isLoading: false, loadOlder: vi.fn() })
  rerender(<TestApp />)
  await screen.findByText('Newest message')
  await screen.findByText('No unread chat messages', { exact: true })
})

it('does not clear unread messages in a background browser tab', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  try {
    const user = userEvent.setup()
    inboxSnapshot = { ...inbox, conversations: [{ ...inbox.conversations[0], lastIncomingSequence: 1 }] }
    useChatThreadMock.mockReturnValue({ data: { messages: [{ id: 'new', sequence: 1, conversationId: 'conversation-1', senderPlayerId: 'player-2', clientMessageId: 'new-id', text: 'Read me', createdAt: '2026-10-17T00:00:00Z' }], hasOlder: false }, isError: false, isLoading: false, loadOlder: vi.fn() })
    render(<TestApp />)
    await user.click(await screen.findByRole('button', { name: /Team B/ }))
    await screen.findByText('Read me')
    expect(screen.getByText('Unread chat messages', { exact: true })).toBeTruthy()
    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await screen.findByText('No unread chat messages', { exact: true })
  } finally { visibility.mockRestore() }
})
