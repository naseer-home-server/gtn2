import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { AdminChatAudit } from 'backend/chats'
import { AdminChatAuditViewer } from './admin-chat-audit'

const audit: AdminChatAudit = {
  sessionId: 'session-1',
  players: [
    { id: 'player-a', email: 'a@example.test', teamId: 'team-a' },
    { id: 'player-b', email: 'b@example.test', teamId: 'team-b' },
  ],
  conversations: [
    {
      conversation: { id: 'direct-1', kind: 'direct', name: null, playerIds: ['player-a', 'player-b'], createdAt: '2026-10-17T00:00:00.000Z', lastMessage: null },
      messages: [{ id: 'message-1', sequence: 1, conversationId: 'direct-1', senderPlayerId: 'player-b', clientMessageId: 'client-1', text: 'Ready for round two?', createdAt: '2026-10-17T00:01:00.000Z' }],
    },
  ],
}

afterEach(cleanup)

describe('admin chat audit viewer', () => {
  it('shows sender identities and the shared transcript in a read-only selected thread', async () => {
    const user = userEvent.setup()
    render(<AdminChatAuditViewer audit={audit} />)

    await user.click(screen.getByRole('button', { name: /a@example.test and b@example.test/ }))
    expect(screen.getByRole('heading', { name: 'a@example.test and b@example.test' })).toBeTruthy()
    expect(screen.getAllByText('b@example.test')).toHaveLength(2)
    expect(screen.getByText('Ready for round two?')).toBeTruthy()
    expect(screen.getByText(/Read-only host view/)).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Message' })).toBeNull()
  })
})
