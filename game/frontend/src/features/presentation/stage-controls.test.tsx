import { QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from 'backend/engine'
import type { PresentationState } from 'backend/presentation'
import { queryClient } from '@/lib/query-client'
import { PresentationStageProvider } from './stage-context'
import { HostSlideControls } from './host-controls'
import { TeamFormationSlide, ConfiguredGameSlide, StartRoundSlide } from './live-slides'
import type { PresentationSlide } from './slides'
const api = vi.hoisted(() => ({ data: null as PresentationState | null, prepare: vi.fn(), start: vi.fn(), advance: vi.fn() }))
vi.mock('@/trpc', () => ({ trpc: { admin: { presentation: { state: { query: async () => api.data } }, game: { defaults: { query: async () => DEFAULT_CONFIG }, start: { mutate: (...args: unknown[]) => api.prepare(...args) }, startRound: { mutate: (...args: unknown[]) => api.start(...args) }, advance: { mutate: (...args: unknown[]) => api.advance(...args) } } } } }))
const slide = (id: string, extra: Partial<PresentationSlide> = {}): PresentationSlide => ({ id, title:id, steps:['test'], notes:'', Component: () => null, ...extra })
const roster: PresentationState = { sessionId:'night', sessionName:'Tonight', allArrived:true, config:DEFAULT_CONFIG, progress:null, cave:null, teams:[], players:[ {id:'b', name:'Bea', arrivalOrder:2}, {id:'c', name:'Cory', arrivalOrder:3}, {id:'a', name:'Ali', arrivalOrder:1} ] }
function host(metadata: PresentationSlide) {
  return render(<QueryClientProvider client={queryClient}><PresentationStageProvider mode="host" game={metadata.game}><TeamFormationSlide/><HostSlideControls slide={metadata}/></PresentationStageProvider></QueryClientProvider>)
}
beforeEach(() => { localStorage.clear(); queryClient.clear(); vi.clearAllMocks(); api.data=structuredClone(roster); api.prepare.mockResolvedValue(undefined); api.start.mockResolvedValue(undefined); api.advance.mockResolvedValue(undefined) })
afterEach(() => { cleanup(); queryClient.clear() })
describe('private stage controls', () => {
  it('picks in arrival order, handles the last solo player, and saves real complete teams', async () => {
    host(slide('make-teams'))
    await screen.findByRole('button', { name:'Bea' })
    expect(screen.getByRole('heading', { name:'Ali' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name:'Cory' }))
    expect(screen.getByRole('heading', { name:'Bea' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name:'Confirm solo team' }))
    const confirm = screen.getByRole('button', { name:'Confirm teams and prepare game' })
    await waitFor(() => expect(confirm.hasAttribute('disabled')).toBe(false))
    fireEvent.click(confirm)
    await waitFor(() => expect(api.prepare).toHaveBeenCalledOnce())
    expect(api.prepare.mock.calls[0][0]).toMatchObject({ sessionId:'night', startingGame:'bonus', teams:[{ name:'Ali & Cory', playerIds:['a','c'] }, {name:'Bea', playerIds:['b']}] })
    expect(within(screen.getByRole('list', {name:'Teams in tie order'})).getAllByRole('listitem')).toHaveLength(2)
  })
  it('undoes a pick and refuses to prepare while invitees are missing', async () => {
    api.data!.allArrived=false
    host(slide('make-teams'))
    await screen.findByRole('button', { name:'Bea' })
    fireEvent.click(screen.getByRole('button', { name:'Bea' }))
    fireEvent.click(screen.getByRole('button', { name:'Undo last team' }))
    expect(screen.getByRole('heading', {name:'Ali'})).toBeTruthy()
    expect(screen.getByRole('button', {name:'Confirm teams and prepare game'}).hasAttribute('disabled')).toBe(true)
    expect(api.prepare).not.toHaveBeenCalled()
  })
  it('starts only the matching round using its current revision', async () => {
    api.data!.progress={game:'bonus', round:1, phase:'ready', status:'playing', revision:9, publicRevealActive:false, starTradingOpen:false}
    host(slide('bonus-round-1-start', {kind:'start',game:'bonus',round:1}))
    const start = await screen.findByRole('button',{name:'Start round 1'})
    await waitFor(() => expect(start.hasAttribute('disabled')).toBe(false))
    fireEvent.click(start)
    await waitFor(() => expect(api.start).toHaveBeenCalledOnce())
    expect(api.start.mock.calls[0][0]).toMatchObject({sessionId:'night',control:{expectedRevision:9,requestId:expect.any(String)}})
    expect(api.advance).not.toHaveBeenCalled()
  })
  it('retries an uncertain start with the same request rather than advancing another round', async () => {
    api.data!.progress={game:'bonus',round:1,phase:'complete',status:'playing',revision:9,publicRevealActive:false,starTradingOpen:false}
    api.advance.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValue(undefined)
    host(slide('bonus-round-2-start',{kind:'start',game:'bonus',round:2}))
    const start = await screen.findByRole('button',{name:'Start round 2'})
    await waitFor(() => expect(start.hasAttribute('disabled')).toBe(false))
    fireEvent.click(start)
    fireEvent.click(await screen.findByRole('button',{name:'Retry same command'}))
    await waitFor(() => expect(api.advance).toHaveBeenCalledTimes(2))
    expect(api.advance.mock.calls[0][0]).toEqual(api.advance.mock.calls[1][0])
  })
  it('blocks a round start while a public reveal is awaiting acknowledgments', async () => {
    api.data!.progress={game:'bonus',round:1,phase:'ready',status:'playing',revision:9,publicRevealActive:true,starTradingOpen:false}
    host(slide('bonus-round-1-start',{kind:'start',game:'bonus',round:1}))
    await screen.findByText('Waiting for all teams to acknowledge the public reveal.')
    expect(screen.getByRole('button',{name:'Start round 1'}).hasAttribute('disabled')).toBe(true)
  })
  it('can finish the night from final standings only after finale round three completes',async()=>{
    api.data!.progress={game:'bomb',round:3,phase:'complete',status:'playing',revision:42,publicRevealActive:false,starTradingOpen:false}
    host(slide('final-standings'))
    const finish=await screen.findByRole('button',{name:'Finish game night'})
    fireEvent.click(finish)
    await waitFor(()=>expect(api.advance).toHaveBeenCalledOnce())
    expect(api.advance.mock.calls[0][0]).toMatchObject({sessionId:'night',control:{expectedRevision:42,requestId:expect.any(String)}})
    expect(api.start).not.toHaveBeenCalled()
  })
  it('shows live cave data only on its matching round and clears it on completion', async () => {
    api.data!.progress={game:'cave',round:1,phase:'cave',status:'playing',revision:9,publicRevealActive:false,starTradingOpen:false}
    api.data!.cave={tick:2,maxTicks:10,unbanked:'10.00',nextTickAt:Date.now()+10_000}
    const result = render(<QueryClientProvider client={queryClient}><PresentationStageProvider mode="screen" game="cave"><StartRoundSlide game="cave" round={2}/></PresentationStageProvider></QueryClientProvider>)
    await screen.findByText('Your host will start the round')
    expect(screen.queryByRole('timer')).toBeNull()
    result.rerender(<QueryClientProvider client={queryClient}><PresentationStageProvider mode="screen" game="cave"><StartRoundSlide game="cave" round={1}/></PresentationStageProvider></QueryClientProvider>)
    await screen.findByRole('timer', {name:'Time remaining in cave tick'})
    expect(screen.getByText('$10.00')).toBeTruthy()
    api.data={...api.data!, cave:null, progress:{...api.data!.progress!,phase:'complete'}}
    await act(async () => { queryClient.setQueryData(['presentation','state','cave'], api.data) })
    await screen.findByRole('heading',{name:'Round complete'})
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.queryByText('$10.00')).toBeNull()
    expect(api.start).not.toHaveBeenCalled(); expect(api.advance).not.toHaveBeenCalled()
  })
  it.each(['bonus','high-low','cave','circle','bomb'] as const)('renders configured %s rules and local input without live commands', async game => {
    const result = render(<QueryClientProvider client={queryClient}><PresentationStageProvider mode="screen" game={game}><ConfiguredGameSlide game={game} kind="rules" step={3}/></PresentationStageProvider></QueryClientProvider>)
    await screen.findByRole('article', {name:game === 'bonus' ? 'Will we get a bonus this year?: take from the bag' : game === 'high-low' ? 'High or low: choose your amount' : game === 'cave' ? 'Cave mining: tick-by-tick' : game === 'bomb' ? 'Gamble bomb: bomb recipient' : /rule 4/})
    result.rerender(<QueryClientProvider client={queryClient}><PresentationStageProvider mode="screen" game={game}><ConfiguredGameSlide game={game} kind="input" step={0}/></PresentationStageProvider></QueryClientProvider>)
    await screen.findByText('Fictional example · nothing is submitted')
    expect(api.prepare).not.toHaveBeenCalled(); expect(api.start).not.toHaveBeenCalled(); expect(api.advance).not.toHaveBeenCalled()
  })
})
