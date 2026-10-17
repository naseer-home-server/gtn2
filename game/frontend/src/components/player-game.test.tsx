import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { PlayerGameView } from 'backend/game'
import { PlayerGame } from './player-game'

const { session } = vi.hoisted(() => ({ session: { current: null as unknown } }))
vi.mock('@/features/player/player-context', () => ({ usePlayerSession: () => session.current }))

const baseView: PlayerGameView = {
  sessionId: 'session-1', sessionName: 'Night', status: 'playing', isTeamLeader: true,
  team: { id: 'team-a', name: 'Amber & Blue', balance: '50.00', stars: 2 },
  teams: [{ id: 'team-a', name: 'Amber & Blue', stars: 2 }, { id: 'team-b', name: 'Coral & Jade', stars: 1 }],
  game: 'bonus', round: 1, token: 'token-1', pot: { amount: '0.00', target: '20.00' },
  privatePot: { amount: '0.00', target: '10.00' }, reveal: null, moneyTransfers: [], starsTransferOpen: false, earnings: [],
  roundState: { phase: 'ready', submitted: false }, allowedActions: [],
}

afterEach(() => {
  cleanup()
  session.current = null
})

describe('player game holding state', () => {
  it('shows a neutral ready screen before any first round and keeps team wallet access', () => {
    session.current = { view: baseView }
    render(<MemoryRouter><PlayerGame /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Waiting for the host' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Your team account' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open wallet/ })).toBeTruthy()
    expect(screen.queryByText('Will we get a bonus this year?')).toBeNull()
    expect(screen.queryByText('Rules and round settings')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows the third-round result while waiting for the next game without revealing its rules', () => {
    session.current = { view: {
      ...baseView, game: 'high-low', round: 3,
      roundState: { phase: 'complete', submitted: true },
      earnings: [{ game: 'high-low', round: 3, amount: '75.25' }],
    } }
    render(<MemoryRouter><PlayerGame /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Waiting for the host' })).toBeTruthy()
    expect(screen.getByText('75.25')).toBeTruthy()
    expect(screen.queryByText('High or low')).toBeNull()
    expect(screen.queryByText('Rules and round settings')).toBeNull()
  })

  it('keeps the rules disclosure for a later round that is waiting to start', () => {
    session.current = { view: {
      ...baseView, round: 2, rules: { bag: 100, threshold: 100, multiplier: 5, roundThreeStars: 1 },
      roundState: { phase: 'ready', submitted: false },
    } }
    render(<MemoryRouter><PlayerGame /></MemoryRouter>)

    expect(screen.queryByRole('heading', { name: 'Waiting for the host' })).toBeNull()
    expect(screen.getByText('Rules and round settings')).toBeTruthy()
  })
})

describe('circle receipts', () => {
  it('names the sender, reports received and returned amounts, and labels the return action', () => {
    session.current = {
      view: {
        ...baseView, game: 'circle', round: 1, rules: { multiplier: 3 },
        roundState: {
          phase: 'return', submitted: false,
          sender: { id: 'team-b', name: 'Coral & Jade', stars: 1 },
          received: { money: '30.00', stars: 2 }, returned: { money: '4.00', stars: 1 },
        },
        allowedActions: ['circle.return'],
      },
      draft: { money: '0', stars: '0', returnMoney: '0', returnStars: '0', amount: '0', pot: '0', privatePot: '0', counts: {} },
      updateDraft: vi.fn(), submit: vi.fn(), action: { isPending: false }, blockedByUncertainTransfer: false,
    }
    render(<MemoryRouter><PlayerGame /></MemoryRouter>)

    expect(screen.getByText('You received 30.00 and 2 stars from Coral & Jade.')).toBeTruthy()
    expect(screen.getByText('You also received back 4.00 and 1 star in returns.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Return to Coral & Jade' })).toBeTruthy()
    expect(screen.queryByText(/recipient team/)).toBeNull()
  })
})
