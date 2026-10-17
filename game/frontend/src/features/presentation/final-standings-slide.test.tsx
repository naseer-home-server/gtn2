import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FinalStandingsBoard } from './final-standings-slide'
import { finalStandingsSteps, standingsScale, type FinalStandings } from './final-standings-model'
const standings:FinalStandings={entries:[{teamId:'a',rank:1,name:'First team',earnings:'3000.00'},{teamId:'b',rank:2,name:'Second team',earnings:'1822.00'},{teamId:'c',rank:3,name:'Last team',earnings:'500.00'}],modelAverage:'1822.00'}
afterEach(cleanup)
describe('final standings reveal',()=>{
  it('reveals last to first, then the benchmark, and hides later reveals when stepping back',()=>{
    const result=render(<FinalStandingsBoard standings={standings} step={0}/>)
    expect(screen.getByText('Last team')).toBeTruthy()
    expect(screen.queryByText('Second team')).toBeNull()
    expect(screen.queryByText('First team')).toBeNull()
    expect(screen.queryByText('$3,000.00')).toBeNull()
    expect(screen.queryByText('AI average')).toBeNull()
    result.rerender(<FinalStandingsBoard standings={standings} step={1}/>)
    expect(screen.getByText('Second team')).toBeTruthy()
    expect(screen.queryByText('First team')).toBeNull()
    expect(screen.queryByText('AI average')).toBeNull()
    result.rerender(<FinalStandingsBoard standings={standings} step={2}/>)
    expect(screen.getByText('First team')).toBeTruthy()
    expect(screen.queryByText('AI average')).toBeNull()
    result.rerender(<FinalStandingsBoard standings={standings} step={3}/>)
    expect(screen.getByText('AI average')).toBeTruthy()
    expect(screen.getAllByText('$1,822.00')).toHaveLength(2)
    result.rerender(<FinalStandingsBoard standings={standings} step={0}/>)
    expect(screen.queryByText('First team')).toBeNull()
    expect(screen.queryByText('AI average')).toBeNull()
  })
  it('has one reveal per team before the AI step, including smaller games',()=>{
    expect(finalStandingsSteps(3)).toEqual(['Reveal rank 3','Reveal rank 2','Reveal rank 1','Reveal the AI average'])
    expect(finalStandingsSteps(7)).toHaveLength(8)
  })
  it('uses one proportional scale including the benchmark and handles huge exact amounts',()=>{
    const scale=standingsScale(standings)
    expect(scale('1500.00')).toBeCloseTo(scale('3000.00')/2,1)
    expect(scale(standings.modelAverage)).toBeGreaterThan(scale('500.00'))
    const below=standingsScale({...standings,entries:standings.entries.map(entry=>({...entry,earnings:'0.00'}))})
    expect(below('0.00')).toBe(0)
    expect(below('1822.00')).toBeLessThan(100)
    const huge=standingsScale({...standings,entries:[{...standings.entries[0],earnings:'10000000000000000000000000000.00'}]})
    expect(Number.isFinite(huge('10000000000000000000000000000.00'))).toBe(true)
    expect(huge('10000000000000000000000000000.00')).toBeLessThan(100)
  })
})
