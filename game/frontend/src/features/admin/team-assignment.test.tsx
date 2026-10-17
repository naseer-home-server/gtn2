import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { TeamAssignment } from 'backend/game'
import { useState } from 'react'
import { TeamAssignmentEditor, type TeamAssignmentPlayer } from './team-assignment'

const players: TeamAssignmentPlayer[] = [
  { id: 'p1', email: 'alex@example.test', arrivalOrder: 1, firstName: 'Alex', name: 'Alex Morgan' },
  { id: 'p2', email: 'sam@example.test', arrivalOrder: 2, firstName: 'Sam', name: 'Sam Lee' },
  { id: 'p3', email: 'later@example.test', arrivalOrder: null, firstName: 'Later', name: 'Later Person' },
  { id: 'p4', email: 'legacy.person@example.test', arrivalOrder: 4 },
]

function AssignmentHarness({ initial = [{ name: 'Team 1', playerIds: [] }, { name: 'Team 2', playerIds: [] }] }: { initial?: TeamAssignment[] }) {
  const [value, setValue] = useState(initial)
  return <><TeamAssignmentEditor players={players} value={value} onChange={setValue} /><output aria-label="Current assignments">{JSON.stringify(value)}</output></>
}

afterEach(() => cleanup())

describe('TeamAssignmentEditor', () => {
  it('generates team names from selected players in selection order', async () => {
    const user = userEvent.setup()
    render(<AssignmentHarness />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team 1, first player' }), 'p1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team 1, second player' }), 'p2')
    expect(screen.getByLabelText('Current assignments').textContent).toContain('Alex & Sam')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Team 1, second player' }), '')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team 1, first player' }), 'p2')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team 1, second player' }), 'p1')
    expect(screen.getByLabelText('Current assignments').textContent).toContain('Sam & Alex')
  })

  it('hides unarrived and already assigned players from other selectors', async () => {
    render(<AssignmentHarness initial={[{ name: 'Alex', playerIds: ['p1'] }, { name: 'Team 2', playerIds: [] }]} />)
    const firstPlayer = screen.getByRole('combobox', { name: 'Team 2, first player' })
    expect(within(firstPlayer).queryByRole('option', { name: /Alex Morgan/ })).toBeNull()
    expect(within(firstPlayer).queryByRole('option', { name: /Later Person/ })).toBeNull()
    expect(within(firstPlayer).getByRole('option', { name: /legacy.person@example.test/ })).toBeTruthy()
    expect(firstPlayer).toBeTruthy()
  })

  it('uses the email local part for legacy names and explains solo teams', async () => {
    const user = userEvent.setup()
    render(<AssignmentHarness />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team 1, first player' }), 'p4')
    expect(screen.getByLabelText('Current assignments').textContent).toContain('legacy.person')
    expect(screen.getByText(/Use a solo team only when attendance is odd/)).toBeTruthy()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Team 2, first player' }), 'p1')
    expect(screen.getAllByText(/Only one solo team is allowed/).length).toBeGreaterThan(0)
  })

  it('keeps two teams minimum and caps additions at seven', async () => {
    const minimumView = render(<AssignmentHarness />)
    expect((screen.getByRole('button', { name: 'Remove team 1' }) as HTMLButtonElement).disabled).toBe(true)
    minimumView.unmount()

    render(<AssignmentHarness initial={Array.from({ length: 7 }, (_, index) => ({ name: `Team ${index + 1}`, playerIds: [] }))} />)
    expect((screen.getByRole('button', { name: 'Add team' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/seven-team limit/)).toBeTruthy()
  })
})
