import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountCommand, Team } from 'backend/game'
import { AdminTeamAccounts } from './team-account-editor'
import { parseAccountBalance, parseAccountStars } from './team-account-utils'

const team: Team = { id: 'team-1', name: 'Coral & Blue', playerIds: ['p1', 'p2'], tieOrder: 1, balance: '1234', stars: 2 }
const requestId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => vi.stubGlobal('crypto', { randomUUID: () => requestId }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('account input parsing', () => {
  it('parses currency exactly with BigInt and supports large balances within the API string limit', () => {
    expect(parseAccountBalance('0012.3')).toEqual({ cents: 1230n, normalized: '12.30' })
    expect(parseAccountBalance('999999999999999999999999999999999999.01')?.normalized).toBe('999999999999999999999999999999999999.01')
    expect(parseAccountBalance('-1.00')).toBeNull()
    expect(parseAccountBalance('1.234')).toBeNull()
    expect(parseAccountBalance('1e3')).toBeNull()
    expect(parseAccountBalance('1'.repeat(1001))).toBeNull()
  })

  it('accepts only safe whole-number star totals', () => {
    expect(parseAccountStars('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseAccountStars('9007199254740992')).toBeNull()
    expect(parseAccountStars('1.5')).toBeNull()
    expect(parseAccountStars('-1')).toBeNull()
  })
})

describe('AdminTeamAccounts', () => {
  it('captures the revision when opened and submits exact decimal and safe-integer values', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(command: AccountCommand) => void>()
    const screenView = render(<AdminTeamAccounts teams={[team]} revision={4} onSave={onSave} pending={false} />)
    await user.click(screen.getByRole('button', { name: 'Edit account for Coral & Blue' }))
    expect(screen.getByRole('dialog').textContent).toContain('12.34')

    screenView.rerender(<AdminTeamAccounts teams={[{ ...team, balance: '999999' }]} revision={5} onSave={onSave} pending={false} />)
    const balance = screen.getByLabelText('New balance')
    await user.clear(balance)
    await user.type(balance, '999999999999999999999999999999999999.01')
    const stars = screen.getByLabelText('New star total')
    await user.clear(stars)
    await user.type(stars, '9007199254740991')
    await user.type(screen.getByLabelText(/Note/), 'Host correction')
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][0]).toEqual({
      requestId,
      expectedRevision: 4,
      teamId: team.id,
      balance: '999999999999999999999999999999999999.01',
      stars: Number.MAX_SAFE_INTEGER,
      reason: 'Host correction',
    })
  })

  it('keeps invalid values from being submitted', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<AdminTeamAccounts teams={[team]} revision={2} onSave={onSave} pending={false} />)
    await user.click(screen.getByRole('button', { name: 'Edit account for Coral & Blue' }))
    await user.clear(screen.getByLabelText('New balance'))
    await user.type(screen.getByLabelText('New balance'), '1.234')
    await user.clear(screen.getByLabelText('New star total'))
    await user.type(screen.getByLabelText('New star total'), '9007199254740992')
    expect((screen.getByRole('button', { name: 'Save account' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByRole('alert').length).toBe(2)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('retries the parent-held command and offers a refresh after stale revisions', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onRetry = vi.fn()
    const onRefresh = vi.fn()
    const screenView = render(<AdminTeamAccounts teams={[team]} revision={8} onSave={onSave} pending={false} onRetry={onRetry} onRefresh={onRefresh} />)
    await user.click(screen.getByRole('button', { name: 'Edit account for Coral & Blue' }))
    await user.click(screen.getByRole('button', { name: 'Save account' }))
    const command = onSave.mock.calls[0][0]
    screenView.rerender(<AdminTeamAccounts teams={[team]} revision={9} onSave={onSave} pending={false} error="The account changed. Refresh and try again." onRetry={onRetry} onRefresh={onRefresh} />)
    expect(screen.getByText(/keeps the revision from when it opened/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Retry same update' }))
    await user.click(screen.getByRole('button', { name: 'Refresh account values' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(command.expectedRevision).toBe(8)
    expect(command.requestId).toBe(requestId)
  })

  it('closes after a completed pending save', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const screenView = render(<AdminTeamAccounts teams={[team]} revision={3} onSave={onSave} pending={false} />)
    await user.click(screen.getByRole('button', { name: 'Edit account for Coral & Blue' }))
    await user.click(screen.getByRole('button', { name: 'Save account' }))
    screenView.rerender(<AdminTeamAccounts teams={[team]} revision={3} onSave={onSave} pending />)
    screenView.rerender(<AdminTeamAccounts teams={[{ ...team, balance: '1300' }]} revision={4} onSave={onSave} pending={false} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
