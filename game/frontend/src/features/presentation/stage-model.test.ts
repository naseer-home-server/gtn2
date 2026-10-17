import { describe, expect, it } from 'vitest'
import type { PresentationState } from 'backend/presentation'
import { clockRemaining, displayClock, remainingPlayers, roundStartOperation, validTeamDraft } from './stage-model'
const players = [{ id:'c', name:'C', arrivalOrder:3 }, { id:'a', name:'A', arrivalOrder:1 }, { id:'b', name:'B', arrivalOrder:2 }]
const ready: NonNullable<PresentationState['progress']> = { game:'bonus', round:1, phase:'ready', status:'playing', revision:1, publicRevealActive:false, starTradingOpen:false }
describe('stage controls', () => {
  it('uses the earliest unpaired arrival and validates complete unique teams', () => {
    expect(remainingPlayers(players, [ { playerIds:['a','c'] } ]).map(p => p.id)).toEqual(['b'])
    expect(validTeamDraft(players, [{ playerIds:['a','c'] }, { playerIds:['b'] }])).toBe(true)
    expect(validTeamDraft(players, [{ playerIds:['a','c'] }, { playerIds:['a'] }])).toBe(false)
    expect(validTeamDraft(players, [{ playerIds:['a'] }, { playerIds:['b'] }, { playerIds:['c'] }])).toBe(false)
  })
  it('allows only the exact prepared or next round and blocks public reveal/stale slides', () => {
    expect(roundStartOperation(ready, 'bonus',1)).toBe('startRound')
    expect(roundStartOperation(ready, 'cave',1)).toBeNull()
    expect(roundStartOperation({ ...ready, phase:'choices' }, 'bonus',1)).toBeNull()
    expect(roundStartOperation({ ...ready, phase:'complete' }, 'bonus',2)).toBe('advance')
    expect(roundStartOperation({ ...ready, phase:'complete', round:3 }, 'high-low',1)).toBe('advance')
    expect(roundStartOperation({ ...ready, publicRevealActive:true }, 'bonus',1)).toBeNull()
    expect(roundStartOperation({ ...ready, status:'finished' }, 'bonus',1)).toBeNull()
  })
  it('derives countdown from an absolute deadline and never drifts or goes negative', () => {
    const clock = { endsAt:610000, remainingMs:600000 }
    expect(displayClock(clockRemaining(clock,9999))).toBe('10:00')
    expect(displayClock(clockRemaining(clock,10000))).toBe('10:00')
    expect(displayClock(clockRemaining(clock,10999))).toBe('10:00')
    expect(displayClock(clockRemaining(clock,11000))).toBe('09:59')
    expect(displayClock(clockRemaining(clock,700000))).toBe('00:00')
    expect(clockRemaining({ endsAt:null, remainingMs:120000 },999999)).toBe(120000)
  })
})
