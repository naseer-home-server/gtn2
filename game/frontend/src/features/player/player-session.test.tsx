import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerGameView } from 'backend/game'
import { queryClient } from '@/lib/query-client'
import { PlayerSessionProvider } from './player-session'
import { usePlayerSession } from './player-context'
import { RevealInterruption } from './reveal-interruption'
import { WalletPage } from './wallet-page'
import { PlayerGame } from '@/components/player-game'

const { stateQuery, actionMutate } = vi.hoisted(() => ({
  stateQuery: vi.fn(),
  actionMutate: vi.fn(),
}))

vi.mock('@/trpc', () => ({
  trpc: { game: { state: { query: stateQuery }, action: { mutate: actionMutate } } },
}))

const firstView: PlayerGameView = {
  sessionId: 'session-1', sessionName: 'Test night', status: 'playing', isTeamLeader: true,
  team: { id: 'team-a', name: 'Team A', balance: '50.00', stars: 1 },
  teams: [{ id: 'team-a', name: 'Team A', stars: 1 }, { id: 'team-b', name: 'Team B', stars: 0 }],
  game: 'bonus', round: 1, token: 'round-token-1', pot: { amount: '0.00', target: '20.00' },
  privatePot: { amount: '0.00', target: '10.00' }, reveal: null, moneyTransfers: [], earnings: [],
  roundState: { phase: 'choice', submitted: false, choiceLimit: '10.00' },
  allowedActions: ['money.transfer', 'pot.contribute'],
}

function Navigation() {
  return <nav aria-label="Test destinations">
    <Link to="/play">Play</Link>
    <Link to="/wallet">Wallet</Link>
  </nav>
}

function PlayPage() {
  const { retry, action } = usePlayerSession()
  return <main><h1>Play destination</h1>
    {action.error && <p role="alert">{action.error.message}</p>}
    <button onClick={() => retry()}>Retry pending command</button>
  </main>
}

function AppRoutes() {
  return <>
    <Navigation />
    <RevealInterruption />
    <Routes>
      <Route path="/play" element={<PlayPage />} />
      <Route path="/wallet" element={<WalletPage />} />
    </Routes>
  </>
}

function TestApp({ sessionId = 'session-1', playerId = 'player-1', initialPath = '/wallet' }: {
  sessionId?: string; playerId?: string; initialPath?: string
}) {
  return <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[initialPath]}>
      <PlayerSessionProvider key={`${sessionId}:${playerId}`} sessionId={sessionId} playerId={playerId}>
        <AppRoutes />
      </PlayerSessionProvider>
    </MemoryRouter>
  </QueryClientProvider>
}

beforeEach(() => {
  queryClient.clear()
  stateQuery.mockResolvedValue(firstView)
  actionMutate.mockReset()
})

afterEach(() => {
  cleanup()
  queryClient.clear()
})

describe('player session lifetime', () => {
  it('retries an uncertain transfer with the same command after navigating away and a background state failure', async () => {
    const user = userEvent.setup()
    actionMutate.mockRejectedValueOnce(new Error('Connection timed out'))
      .mockResolvedValueOnce({ ...firstView, token: 'round-token-1' })
    render(<TestApp />)

    await user.type(await screen.findByLabelText('Total amount to send'), '12.50')
    await user.click(screen.getByRole('checkbox', { name: /Team B/ }))
    await user.click(screen.getAllByRole('button', { name: 'Send money' }).at(-1)!)
    await screen.findByText(/result is uncertain/i)
    const originalCommand = actionMutate.mock.calls[0][0]

    await user.click(screen.getByRole('link', { name: 'Play' }))
    await screen.findByRole('heading', { name: 'Play destination' })
    stateQuery.mockRejectedValueOnce(new Error('Temporary refresh failure'))
    await queryClient.refetchQueries({ queryKey: ['game', 'player', 'session-1', 'player-1'], type: 'active' })
    expect((await screen.findByRole('alert')).textContent).toContain('Connection timed out')

    await user.click(screen.getByRole('button', { name: 'Retry pending command' }))
    await waitFor(() => expect(actionMutate).toHaveBeenCalledTimes(2))
    expect(actionMutate.mock.calls[1][0]).toEqual(originalCommand)
    expect(originalCommand).toMatchObject({ token: 'round-token-1', action: { type: 'money.transfer', amount: '12.50' } })
  })

  it('keeps transfer recipients and amount when Wallet unmounts and remounts its sections', async () => {
    const user = userEvent.setup()
    render(<TestApp />)

    const total = await screen.findByLabelText('Total amount to send')
    await user.type(total, '12.50')
    await user.click(screen.getByRole('checkbox', { name: /Team B/ }))
    await user.click(screen.getByRole('button', { name: 'Activity' }))
    await screen.findByText('Round earnings')
    await user.click(screen.getByRole('button', { name: 'Send money' }))

    expect((screen.getByLabelText('Total amount to send') as HTMLInputElement).value).toBe('12.50')
    expect((screen.getByRole('checkbox', { name: /Team B/ }) as HTMLInputElement).checked).toBe(true)
    expect((document.getElementById('money-transfer-share-team-b') as HTMLInputElement).value).toBe('12.50')
  })

  it('keeps a rank contribution draft across Wallet sections and clears it when the round token changes', async () => {
    const user = userEvent.setup()
    render(<TestApp />)
    await user.click(await screen.findByRole('button', { name: 'Rank reveals' }))
    const contribution = await screen.findByLabelText('Contribution', { selector: '#private-pot-contribution' })
    await user.clear(contribution)
    await user.type(contribution, '7.25')
    await user.click(screen.getByRole('button', { name: 'Activity' }))
    await user.click(screen.getByRole('button', { name: 'Rank reveals' }))
    expect((screen.getByLabelText('Contribution', { selector: '#private-pot-contribution' }) as HTMLInputElement).value).toBe('7.25')

    queryClient.setQueryData(['game', 'player', 'session-1', 'player-1'], { ...firstView, token: 'round-token-2' })
    await waitFor(() => expect((screen.getByLabelText('Contribution', { selector: '#private-pot-contribution' }) as HTMLInputElement).value).toBe('0'))
  })

  it('clears drafts when the signed-in player identity changes and the session provider remounts', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TestApp />)
    await user.click(await screen.findByRole('button', { name: 'Rank reveals' }))
    const contribution = await screen.findByLabelText('Contribution', { selector: '#private-pot-contribution' })
    await user.clear(contribution)
    await user.type(contribution, '4.00')

    rerender(<TestApp playerId="player-2" />)
    await user.click(await screen.findByRole('button', { name: 'Rank reveals' }))
    await waitFor(() => expect((screen.getByLabelText('Contribution', { selector: '#private-pot-contribution' }) as HTMLInputElement).value).toBe('0'))
  })

  it('does not restore an acknowledged rank reveal when an older poll completes afterward', async () => {
    const user = userEvent.setup()
    const revealedView: PlayerGameView = {
      ...firstView,
      reveal: { id: 'reveal-1', scope: 'self', rankings: [{ teamId: 'team-a', rank: 1 }] },
      allowedActions: [...firstView.allowedActions, 'reveal.acknowledge'],
    }
    let resolveOldPoll: ((view: PlayerGameView) => void) | undefined
    stateQuery.mockReset()
    stateQuery.mockResolvedValueOnce(revealedView).mockImplementationOnce(() => new Promise<PlayerGameView>((resolve) => {
      resolveOldPoll = resolve
    }))
    const acknowledgedView: PlayerGameView = {
      ...revealedView, reveal: null,
      allowedActions: firstView.allowedActions,
    }
    actionMutate.mockResolvedValueOnce(acknowledgedView)
    render(<TestApp />)

    await screen.findByRole('heading', { name: 'Your rank revealed' })
    const oldPoll = queryClient.refetchQueries({ queryKey: ['game', 'player', 'session-1', 'player-1'], type: 'active' })
    await waitFor(() => expect(stateQuery).toHaveBeenCalledTimes(2))
    await user.click(screen.getByRole('button', { name: 'Acknowledge and hide' }))
    await waitFor(() => expect(actionMutate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your rank revealed' })).toBeNull())

    resolveOldPoll?.(revealedView)
    await oldPoll
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your rank revealed' })).toBeNull())
  })
})


it('keeps the private account balance on Play current, including after the final game', async () => {
  render(<QueryClientProvider client={queryClient}><MemoryRouter><PlayerSessionProvider sessionId="session-1" playerId="player-1"><PlayerGame /></PlayerSessionProvider></MemoryRouter></QueryClientProvider>)
  expect((await screen.findByRole('region', { name: 'Your team account' })).textContent).toContain('50.00')
  expect(screen.getByRole('link', { name: 'Open wallet. Team balance 50.00' }).getAttribute('href')).toBe('/wallet')
  queryClient.setQueryData(['game', 'player', 'session-1', 'player-1'], { ...firstView, team: { ...firstView.team!, balance: '1234.56' } })
  await screen.findByRole('link', { name: 'Open wallet. Team balance 1,234.56' })
  queryClient.setQueryData(['game', 'player', 'session-1', 'player-1'], { ...firstView, status: 'finished', team: { ...firstView.team!, balance: '1234.56' } })
  await screen.findByRole('heading', { name: 'That’s a wrap.' })
  expect(screen.getByRole('region', { name: 'Your team account' }).textContent).toContain('1,234.56')
})


it('preserves the configured cave tick limit and automatic banking information on Play', async () => {
  stateQuery.mockResolvedValue({
    ...firstView, game: 'cave', rules: { maxTicks: 8 },
    roundState: { phase: 'cave', tick: 8, submitted: false, unbanked: '100.00', nextTickAt: null },
    allowedActions: ['cave.decide'],
  })
  render(<QueryClientProvider client={queryClient}><MemoryRouter><PlayerSessionProvider sessionId="session-1" playerId="player-1"><PlayerGame /></PlayerSessionProvider></MemoryRouter></QueryClientProvider>)
  expect((await screen.findByText(/Tick 8 of 8/)).textContent).toContain('automatically bank their money when the final window expires')
  const settings = screen.getByText('Maximum ticks').parentElement!
  expect(settings.textContent).toBe('Maximum ticks8')
})
