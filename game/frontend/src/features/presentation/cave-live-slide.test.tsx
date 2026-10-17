import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaveLiveSlide } from './cave-live-slide'
const cave = { tick:2, maxTicks:10, unbanked:'10.00', nextTickAt:20_000 }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000) })
afterEach(() => { cleanup(); vi.useRealTimers() })
describe('live cave presentation', () => {
  it('uses the server deadline, clamps at zero, and resets from the next server tick', () => {
    const result = render(<CaveLiveSlide round={1} cave={cave} paused={false}/>)
    const clock = () => screen.getByRole('timer',{name:'Time remaining in cave tick'}).textContent
    expect(clock()).toContain('10s')
    act(() => { vi.advanceTimersByTime(2500) })
    expect(clock()).toContain('8s')
    act(() => { vi.advanceTimersByTime(12_000) })
    expect(clock()).toContain('0s')
    expect(screen.getByText('Checking cave…')).toBeTruthy()
    result.rerender(<CaveLiveSlide round={1} cave={{...cave,tick:3,unbanked:'20.00',nextTickAt:Date.now()+10_000}} paused={false}/>)
    expect(clock()).toContain('10s')
    expect(screen.getByText('$20.00')).toBeTruthy()
    expect(screen.getByText('Round 1 · Tick 3 / 10')).toBeTruthy()
  })
  it('pauses for reveals, hides stale readings on disconnect, and resumes with the server deadline', () => {
    const result = render(<CaveLiveSlide round={1} cave={{...cave,nextTickAt:null}} paused/>)
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(screen.getByText('Paused')).toBeTruthy()
    expect(screen.getByText('$10.00')).toBeTruthy()
    result.rerender(<CaveLiveSlide round={1} cave={cave} paused={false} connectionLost/>)
    expect(screen.getByText('Reconnecting…')).toBeTruthy()
    expect(screen.queryByText('$10.00')).toBeNull()
    result.rerender(<CaveLiveSlide round={1} cave={{...cave,nextTickAt:Date.now()+10_000}} paused={false}/>)
    expect(screen.getByRole('timer').textContent).toContain('10s')
    expect(screen.getByText('$10.00')).toBeTruthy()
  })
  it('labels the final window as automatic banking instead of another collapse check', () => {
    render(<CaveLiveSlide round={3} cave={{...cave,tick:10}} paused={false}/>)
    expect(screen.getByText('Automatic banking in')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(screen.getByText('Banking…')).toBeTruthy()
    expect(screen.queryByText('Checking cave…')).toBeNull()
  })
})
