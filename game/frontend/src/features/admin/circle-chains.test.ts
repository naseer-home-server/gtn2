import { describe, expect, it } from 'vitest'
import { circleChains, currentCircleStarts, normalizeCircleSelection } from './circle-chain-model'

describe('recorded circle chains', () => {
  it.each([[2], [3], [4], [2,2], [5], [3,2], [6], [4,2], [3,3], [2,2,2], [7], [5,2], [4,3], [3,2,2]])('preserves every directed link in partition %j', (...sizes: number[]) => {
    const ids: string[] = [], next: Record<string, string> = {}
    for (const size of sizes) {
      const group = Array.from({ length: size }, (_, index) => `team-${ids.length + index}`)
      group.forEach((id, index) => { next[id] = group[(index + 1) % group.length] })
      ids.push(...group)
    }
    const chains = circleChains(next, ids)
    expect(chains.map(chain => chain.length)).toEqual(sizes)
    expect(chains.flat().sort()).toEqual([...ids].sort())
    for (const chain of chains) chain.forEach((id, i) => expect(next[id]).toBe(chain[(i + 1) % chain.length]))
  })
  it('rejects missing, singleton, duplicate and unknown links', () => {
    for (const next of ([{ a: 'a', b: 'b' }, { a: 'b' }, { a: 'b', b: 'b' }, { a: 'b', b: 'x' }] as Record<string, string>[])) expect(() => circleChains(next, ['a','b'])).toThrow()
  })

  it('shows only rounds from the latest circle attempt after a reset', () => {
    const events = [
      { id: 'old-1', type: 'circle.started', data: { round: 1 } },
      { id: 'old-2', type: 'circle.started', data: { round: 2 } },
      { id: 'old-3', type: 'circle.started', data: { round: 3 } },
      { id: 'circle-reset', type: 'game.reset', data: { game: 'circle' } },
      { id: 'new-1', type: 'circle.started', data: { round: 1 } },
    ]

    expect(currentCircleStarts(events).map(event => [event.id, event.data.round])).toEqual([['new-1', 1]])
  })

  it('normalizes a selection removed by reset to Latest round, preserving current-attempt selections', () => {
    const starts = [
      { id: 'new-1', type: 'circle.started', data: { round: 1 } },
      { id: 'new-2', type: 'circle.started', data: { round: 2 } },
    ]

    expect(normalizeCircleSelection('old-3', starts)).toBe('latest')
    expect(normalizeCircleSelection('new-1', starts)).toBe('new-1')
    expect(normalizeCircleSelection('latest', starts)).toBe('latest')
  })

  it('keeps the circle attempt visible when a later game is reset', () => {
    const events = [
      { id: 'circle-1', type: 'circle.started', data: { round: 1 } },
      { id: 'circle-2', type: 'circle.started', data: { round: 2 } },
      { id: 'bomb-reset', type: 'game.reset', data: { game: 'bomb' } },
      { id: 'circle-3', type: 'circle.started', data: { round: 3 } },
    ]

    expect(currentCircleStarts(events).map(event => event.id)).toEqual(['circle-1', 'circle-2', 'circle-3'])
  })
})
