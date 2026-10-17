import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerGameView } from 'backend/game'
import { StarTransferCard } from './star-transfer-card'

const { session } = vi.hoisted(() => ({ session: { current: null as unknown } }))
vi.mock('@/features/player/player-context', () => ({ usePlayerSession: () => session.current }))

const view: PlayerGameView = {
  sessionId: 'session', sessionName: 'Night', status: 'playing', isTeamLeader: true,
  team: { id: 'team-a', name: 'Amber', balance: '20.00', stars: 3 },
  teams: [{ id: 'team-a', name: 'Amber', stars: 3 }, { id: 'team-b', name: 'Blue', stars: 1 }],
  game: 'bomb', round: 1, token: 'token', pot: { amount: '0.00', target: '20.00' },
  privatePot: { amount: '0.00', target: '10.00' }, reveal: null, moneyTransfers: [], starsTransferOpen: true, earnings: [],
  roundState: { phase: 'ready', submitted: false }, allowedActions: ['stars.transfer'],
}

const setup = (overrides: Record<string, unknown> = {}) => {
  const submit = vi.fn()
  const retry = vi.fn()
  session.current = {
    view: { ...view, ...overrides.view as Partial<PlayerGameView> },
    submit, retry, action: { isPending: false, isSuccess: false, error: null, variables: undefined }, blockedByUncertainTransfer: false,
  }
  render(<StarTransferCard />)
  return { submit, retry }
}

afterEach(() => { cleanup(); session.current = null })

describe('star transfer card', () => {
  it('submits a positive star transfer to a selected team', () => {
    const { submit } = setup()
    fireEvent.change(screen.getByLabelText('Recipient team'), { target: { value: 'team-b' } })
    fireEvent.change(screen.getByLabelText('Stars to send'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send stars' }))
    expect(submit).toHaveBeenCalledWith({ type: 'stars.transfer', recipientTeamId: 'team-b', stars: 2 })
  })

  it('does not submit while an earlier result is uncertain and offers same-command retry', () => {
    const submit = vi.fn()
    const retry = vi.fn()
    session.current = {
      view,
      submit, retry,
      action: { isPending: false, isSuccess: false, error: new Error('Connection timed out'), variables: { action: { type: 'stars.transfer', recipientTeamId: 'team-b', stars: 1 } } },
      blockedByUncertainTransfer: true,
    }
    render(<StarTransferCard />)
    fireEvent.change(screen.getByLabelText('Recipient team'), { target: { value: 'team-b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send stars' }))
    expect(submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry the same transfer' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('does not offer a transfer when the window is closed or the player is not leader', () => {
    setup({ view: { starsTransferOpen: false } })
    expect(screen.getByText(/Star trading is closed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send stars' })).toBeNull()

    cleanup()
    setup({ view: { isTeamLeader: false } })
    expect(screen.getByText(/team leader can send stars/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send stars' })).toBeNull()
  })
})
