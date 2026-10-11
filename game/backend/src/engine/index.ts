import { startEarlyGame, actEarlyGame, tickCave } from './early-games.js'
import { startFinalGame, actFinalGame } from './final-games.js'
import { gameConfigSchema } from './config.js'
import { cents, ensure, moneyAdd, moneyCompare, moneyMin, moneyScale, moneySub, teamById } from './helpers.js'
import { GAME_ORDER, type CurrentRound, type EngineEnv, type EngineEvent, type EngineState, type GameAction, type GameConfig, type Ranking, type Team } from './types.js'
export { DEFAULT_CONFIG, gameConfigSchema } from './config.js'
export { playerView } from './views.js'
export type * from './types.js'

export function rankings(state: EngineState): Ranking[] {
  return [...state.teams].sort((a, b) => moneyCompare(b.balance, a.balance) || a.tieOrder - b.tieOrder)
    .map((team, index) => ({ teamId: team.id, rank: index + 1 }))
}
export function refreshPotTarget(state: EngineState) {
  if (state.pot.amount !== '0') return
  const earned = moneyAdd(...state.teams.map((team) => moneyAdd(team.balance, state.potSpent?.[team.id] ?? '0')))
  state.pot.target = moneyScale(earned, state.config.revealPotMultiplier, state.teams.length)
  if (moneyCompare(earned, '0') > 0 && state.pot.target === '0') state.pot.target = '1'
}
function startRound(state: EngineState, env: EngineEnv): EngineEvent[] {
  state.current = { ...state.current, game: GAME_ORDER[state.gameIndex] } as CurrentRound
  const events = state.gameIndex < 3 ? startEarlyGame(state, env) : startFinalGame(state, env)
  refreshPotTarget(state)
  return events
}
export function startEngine(teams: Team[], config: GameConfig, env: EngineEnv): { state: EngineState; events: EngineEvent[] } {
  gameConfigSchema.parse(config)
  ensure(teams.length >= 2 && teams.length <= 5, 'Assign between two and five teams.')
  ensure(new Set(teams.map((team) => team.id)).size === teams.length, 'Team IDs must be unique.')
  const state: EngineState = {
    version: 1, revision: 0, status: 'playing', config: structuredClone(config),
    teams: teams.map((team) => ({ ...team, balance: cents(config.initialBalance), stars: 0 })),
    gameIndex: 0, round: 1, current: { game: 'bonus', phase: 'choices', choices: {}, token: '' },
    history: [], caveTotals: {}, advantagedTeamId: null, pot: { amount: '0', target: '0' }, potSpent: {}, reveal: null,
  }
  const events: EngineEvent[] = [{ type: 'playthrough.started', data: { teams: structuredClone(state.teams), config: structuredClone(state.config) } }, ...startRound(state, env)]
  return { state, events }
}
export function advanceEngine(state: EngineState, env: EngineEnv): EngineEvent[] {
  ensure(state.status === 'playing' && state.current.phase === 'complete', 'Finish this round before advancing.')
  ensure(!state.reveal, 'All teams must acknowledge the rankings reveal first.')
  if (state.round < 3) state.round += 1
  else { state.gameIndex += 1; state.round = 1 }
  if (state.gameIndex === GAME_ORDER.length) {
    state.status = 'finished'; state.gameIndex = GAME_ORDER.length - 1; state.round = 3; state.current.token = env.token()
    return [{ type: 'playthrough.finished', data: { rankings: rankings(state) } }]
  }
  return startRound(state, env)
}
export function applyAction(state: EngineState, teamId: string, token: string, action: GameAction, env: EngineEnv): EngineEvent[] {
  const team = teamById(state, teamId)
  ensure(token === state.current.token, 'This action belongs to an earlier round or tick. Refresh your state.')
  if (action.type === 'reveal.acknowledge') {
    ensure(state.reveal, 'There is no rankings reveal to acknowledge.')
    ensure(!state.reveal.acknowledged.includes(teamId), 'Your team already acknowledged this reveal.')
    state.reveal.acknowledged.push(teamId)
    const events: EngineEvent[] = [{ type: 'reveal.acknowledged', data: { teamId, revealId: state.reveal.id } }]
    if (state.reveal.acknowledged.length === state.teams.length) {
      events.push({ type: 'reveal.closed', data: { revealId: state.reveal.id } })
      state.reveal = null; state.current.token = env.token()
      if (state.current.game === 'cave' && state.current.phase === 'cave') state.current.nextTickAt = env.now + state.config.cave.tickSeconds * 1000
    }
    return events
  }
  ensure(!state.reveal, 'All teams must acknowledge the rankings reveal before play resumes.')
  if (action.type === 'pot.contribute') {
    refreshPotTarget(state)
    ensure(moneyCompare(state.pot.target, '0') > 0, 'The reveal pot opens once teams have earnings.')
    const requested = cents(action.amount)
    ensure(moneyCompare(requested, '0') > 0, 'Contribute a positive amount.')
    const amount = moneyMin(requested, moneySub(state.pot.target, state.pot.amount))
    ensure(moneyCompare(amount, team.balance) <= 0, 'Contribution exceeds your available balance.')
    team.balance = moneySub(team.balance, amount); state.pot.amount = moneyAdd(state.pot.amount, amount)
    state.potSpent ??= {}; state.potSpent[teamId] = moneyAdd(state.potSpent[teamId] ?? '0', amount)
    const events: EngineEvent[] = [{ type: 'pot.contributed', data: { teamId, amount, total: state.pot.amount, target: state.pot.target } }]
    if (moneyCompare(state.pot.amount, state.pot.target) === 0) {
      state.reveal = { id: env.token(), rankings: rankings(state), acknowledged: [] }
      state.pot.amount = '0'; state.current.token = env.token(); refreshPotTarget(state)
      events.push({ type: 'rankings.revealed', data: { revealId: state.reveal.id, rankings: state.reveal.rankings } })
    }
    return events
  }
  ensure(state.status === 'playing', 'The playthrough is finished.')
  if (action.type === 'cave.decide' && state.current.game === 'cave') {
    ensure(state.current.nextTickAt !== null && env.now < state.current.nextTickAt, 'This cave decision window has closed. Refresh your state.')
  }
  const events = state.gameIndex < 3 ? actEarlyGame(state, teamId, action, env) : actFinalGame(state, teamId, action, env)
  refreshPotTarget(state)
  return events
}
export function tickEngine(state: EngineState, env: EngineEnv): EngineEvent[] {
  if (state.status !== 'playing' || state.current.game !== 'cave' || state.current.phase !== 'cave' || state.reveal) return []
  const events = tickCave(state, env)
  refreshPotTarget(state)
  return events
}
