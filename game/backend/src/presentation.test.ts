import assert from 'node:assert/strict'
import { test } from 'node:test'
import { presentationState } from './presentation.js'
import { startEngine, DEFAULT_CONFIG } from './engine/index.js'
import type { GameplayRepository } from './engine/types.js'
import type { GameSession, GameSessionsRepository } from './session-types.js'
import { appRouter } from './router.js'
import { testSessions } from './session-test-fixture.js'

const session: GameSession = { id: 'session', name: 'Tonight', createdAt: '', isActive: true, currentGame: null, currentRound: null, players: [
  { id: 'p2', name: 'Bea', email: 'private2@example.com', arrivalOrder: 2 },
  { id: 'p1', name: 'Ali', email: 'private1@example.com', arrivalOrder: 1 },
  { id: 'p3', email: 'secret@example.com', arrivalOrder: 3 },
] }
const sessions = { list: async () => [session] } as GameSessionsRepository
const engine = () => startEngine([
  { id: 'b', name: 'Bea', playerIds: ['p2'], tieOrder: 2, balance: '0', stars: 0 },
  { id: 'a', name: 'Ali & Player 3', playerIds: ['p1','p3'], tieOrder: 1, balance: '0', stars: 0 },
], DEFAULT_CONFIG, { now: 0, random: () => .5, token: () => 'token' }).state

test('stage projection excludes balances, emails, choices, private reveals, audit and circle links', async () => {
  const state = engine()
  state.teams[0].balance = '123456789'
  state.current = { game: 'bonus', phase: 'choices', token: 'secret-token', choices: { a: 'SECRET-CHOICE' } }
  state.privateReveals = { a: { id: 'PRIVATE-REVEAL', rank: 1 } }
  const gameplay = { adminView: async () => ({ sessionId: session.id, sessionName: session.name, state, events: [{ data: { text: 'SECRET-AUDIT' } }] }) } as unknown as GameplayRepository
  const view = await presentationState(sessions, gameplay)
  assert.ok(view)
  const serialized = JSON.stringify(view)
  for (const secret of ['123456789', '@example.com', 'secret-token', 'SECRET-CHOICE', 'PRIVATE-REVEAL', 'SECRET-AUDIT', 'rankings', '"balance":', '"events":', '"choices":']) assert.ok(!serialized.includes(secret), secret)
  assert.deepEqual(view.players.map(player => player.name), ['Ali','Bea','Player 3'])
  assert.deepEqual(view.teams.map(team => team.id), ['a','b'])
  assert.equal(view.config.bomb.advantageChits, DEFAULT_CONFIG.bomb.maxChits)
  const finale = await presentationState(sessions, gameplay, 'bomb')
  assert.equal(finale!.config.bomb.advantageChits, DEFAULT_CONFIG.bomb.advantageChits)
  assert.equal(state.config.bomb.advantageChits, DEFAULT_CONFIG.bomb.advantageChits)
})
test('no active session returns no roster or game state', async () => {
  const gameplay = { adminView: async () => { throw new Error('must not read game') } } as unknown as GameplayRepository
  assert.equal(await presentationState({ list: async () => [{ ...session, isActive: false }] } as GameSessionsRepository, gameplay), null)
})
test('presentation endpoints remain admin-only even though stage data is filtered', async () => {
  const caller = (user: { id: string; email: string; isAdmin: boolean; isTestLogin: boolean } | null) => appRouter.createCaller({ user, sessions: testSessions, settings: { get: async () => ({ emailLoginEnabled: true }), setEmailLoginEnabled: async () => ({ emailLoginEnabled: true }) }, signInWithTestEmail: async () => {} })
  await assert.rejects(caller(null).admin.presentation.state({}), { code: 'UNAUTHORIZED' })
  await assert.rejects(caller({ id: 'p', email: 'p@example.com', isAdmin: false, isTestLogin: false }).admin.presentation.state({}), { code: 'FORBIDDEN' })
  await assert.rejects(caller({ id: 'p', email: 'p@example.com', isAdmin: true, isTestLogin: true }).admin.presentation.state({}), { code: 'FORBIDDEN' })
})

test('live cave projection exposes the shared clock and haul, never departures or banked amounts', async () => {
  const state = engine()
  state.current = { game:'cave', phase:'cave', token:'PRIVATE-TOKEN', tick:3, stage:'decisions', nextTickAt:22_000,
    unbanked:'2000', inside:['PRIVATE-INSIDE'], decisions:{ 'PRIVATE-DECISION':'leave' }, banked:{ a:'987654321' }, collapsed:false }
  const gameplay = { adminView:async () => ({state}) } as unknown as GameplayRepository
  const view = await presentationState(sessions, gameplay, 'cave')
  assert.deepEqual(view!.cave, {tick:3,maxTicks:10,unbanked:'20.00',nextTickAt:22_000})
  const serialized = JSON.stringify(view)
  for (const secret of ['PRIVATE-TOKEN','PRIVATE-INSIDE','PRIVATE-DECISION','987654321','"inside":','"banked":','"decisions":']) assert.ok(!serialized.includes(secret), secret)
  state.reveal={id:'PRIVATE-REVEAL',rankings:[],acknowledged:[]}
  const paused = await presentationState(sessions, gameplay, 'cave')
  assert.equal(paused!.cave!.nextTickAt, null)
  assert.equal(paused!.cave!.unbanked, '20.00')
  assert.equal(state.current.nextTickAt, 22_000)
  state.current.phase='complete'
  assert.equal((await presentationState(sessions, gameplay, 'cave'))!.cave, null)
  state.current={game:'cave',phase:'ready',token:'private'}
  assert.equal((await presentationState(sessions, gameplay, 'cave'))!.cave, null)
})


test('formation can explicitly include member emails without adding them to other stage responses', async () => {
  const gameplay = { adminView:async () => ({state:engine()}) } as unknown as GameplayRepository
  const formation = await presentationState(sessions, gameplay, undefined, true)
  assert.equal(formation!.players.find(player => player.id === 'p1')!.email, 'private1@example.com')
  const ordinary = await presentationState(sessions, gameplay)
  assert.ok(ordinary!.players.every(player => !('email' in player)))
})

test('final standings and model average require explicit request and a finished game night', async () => {
  const state = engine()
  state.current={game:'bomb',phase:'complete',token:'PRIVATE-TOKEN',choices:{},recipient:'a',direction:'up'}
  state.round=3
  state.teams.find(team=>team.id==='a')!.balance='182200'
  state.teams.find(team=>team.id==='b')!.balance='182200'
  const gameplay = {adminView:async()=>({state})} as unknown as GameplayRepository
  assert.equal((await presentationState(sessions,gameplay,undefined,false,true))!.finalStandings,undefined)
  state.status='finished'
  const normal = await presentationState(sessions,gameplay)
  assert.equal(normal!.finalStandings,undefined)
  assert.ok(!JSON.stringify(normal).includes('1822.00'))
  const result = (await presentationState(sessions,gameplay,undefined,false,true))!.finalStandings!
  assert.deepEqual(result,{entries:[{teamId:'a',rank:1,name:'Ali & Player 3',earnings:'1822.00'},{teamId:'b',rank:2,name:'Bea',earnings:'1822.00'}],modelAverage:'1822.00'})
  assert.ok(!JSON.stringify(result).includes('PRIVATE-TOKEN'))
})
test('final standings preserve cent precision when balances exceed Number integer precision', async () => {
  const state=engine(); state.status='finished'
  state.teams.find(team=>team.id==='a')!.balance='900719925474099302'
  state.teams.find(team=>team.id==='b')!.balance='900719925474099303'
  const gameplay={adminView:async()=>({state})} as unknown as GameplayRepository
  const result=(await presentationState(sessions,gameplay,undefined,false,true))!.finalStandings!
  assert.deepEqual(result.entries.map(team=>[team.teamId,team.rank,team.earnings]),[['b',1,'9007199254740993.03'],['a',2,'9007199254740993.02']])
})
