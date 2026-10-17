import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { DEFAULT_CONFIG } from 'backend/engine'
import type { GameConfig } from 'backend/game'
import { GameConfigEditor } from './game-config-editor'

afterEach(cleanup)

describe('GameConfigEditor', () => {
  it('shows all games and edits round values with their units during setup', () => {
    const onChange = vi.fn()
    render(<GameConfigEditor value={structuredClone(DEFAULT_CONFIG)} onChange={onChange} />)

    expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Cave mining' })).toBeTruthy()
    expect(screen.getByLabelText('Starting balance').parentElement?.textContent).toContain('currency')
    fireEvent.change(screen.getByLabelText('Round 1', { selector: '#all-bonus-bag-round-1' }), { target: { value: '125' } })

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ bonus: expect.objectContaining({ bag: [125, 100, 100] }) }))
  })

  it('scopes a game editor to that game and reveal multiplier, without initial balance or star controls for circle/bomb', () => {
    const value = structuredClone(DEFAULT_CONFIG)
    const onChange = vi.fn()
    const { rerender } = render(<GameConfigEditor value={value} onChange={onChange} game="circle" />)
    expect(screen.getByRole('heading', { name: 'What goes around comes around' })).toBeTruthy()
    expect(screen.queryByLabelText('Starting balance')).toBeNull()
    expect(screen.getByLabelText('Reveal price multiplier')).toBeTruthy()
    expect(screen.queryByText(/stars/i)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Gamble bomb' })).toBeNull()

    rerender(<GameConfigEditor value={value} onChange={onChange} game="bomb" />)
    expect(screen.getByLabelText('Minimum chits per pile')).toBeTruthy()
    expect(screen.queryByText(/stars/i)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'What goes around comes around' })).toBeNull()
  })

  it('preserves a five-entry cave risk snapshot and reports field validity as values are corrected', async () => {
    const value = structuredClone(DEFAULT_CONFIG) as GameConfig
    value.cave.collapseRisk = [5, 20, 35, 50, 65]
    const onChange = vi.fn()
    const onValidityChange = vi.fn()
    render(<GameConfigEditor value={value} onChange={onChange} game="cave" onValidityChange={onValidityChange} />)

    expect(screen.getAllByLabelText(/departed/)).toHaveLength(5)
    fireEvent.change(screen.getByLabelText('Round 1', { selector: '#cave-cave-starting-money-round-1' }), { target: { value: '12.5' } })
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ cave: expect.objectContaining({ startingMoney: [12.5, 5, 5], collapseRisk: [5, 20, 35, 50, 65] }) }))

    const ticks = screen.getByLabelText('Maximum ticks')
    fireEvent.change(ticks, { target: { value: '1001' } })
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false))
    expect(screen.getByText(/Enter a whole number from 1 to 1000/)).toBeTruthy()
    fireEvent.change(ticks, { target: { value: '8' } })
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true))
  })

  it('reports cross-field chit limit errors from the shared config schema', async () => {
    const onValidityChange = vi.fn()
    function ControlledEditor() {
      const [config, setConfig] = useState(structuredClone(DEFAULT_CONFIG))
      return <GameConfigEditor value={config} onChange={setConfig} game="bomb" onValidityChange={onValidityChange} />
    }
    render(<ControlledEditor />)
    fireEvent.change(screen.getByLabelText('Standard maximum per pile'), { target: { value: '61' } })
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false))
    expect(screen.getByText(/minimum ≤ standard maximum ≤ most-starred maximum/)).toBeTruthy()
  })
})
