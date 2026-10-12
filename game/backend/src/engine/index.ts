import { startEarlyGame, actEarlyGame, tickCave } from './early-games.js'
import { startFinalGame, actFinalGame } from './final-games.js'
import { gameConfigSchema } from './config.js'
import { cents, ensure, moneyAdd, moneyCompare, moneyMin, moneyScale, moneySub, safeMoney, teamById } from './helpers.js'
import { GAME_ORDER, type CurrentRound, type EngineEnv, type EngineEvent, type EngineState, type GameAction, type GameConfig, type GameId, type Ranking, type Team } from './types.js'
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
function captureGameStart(state: EngineState) {
  state.gameStart = {
    gameIndex: state.gameIndex,
    accounts: Object.fromEntries(state.teams.map((team) => [team.id, { balance: team.balance, stars: team.stars }])),
    historyLength: state.history.length,
    caveTotals: structuredClone(state.caveTotals),
    advantagedTeamId: state.advantagedTeamId,
    pot: structuredClone(state.pot),
    potSpent: structuredClone(state.potSpent ?? {}),
    reveal: structuredClone(state.reveal),
    moneyTransfersLength: (state.moneyTransfers ?? []).length,
  }
}
export function startEngine(teams: Team[], config: GameConfig, env: EngineEnv, startingGame: EngineState['current']['game'] = 'bonus'): { state: EngineState; events: EngineEvent[] } {
  gameConfigSchema.parse(config)
  ensure(teams.length >= 2 && teams.length <= 5, 'Assign between two and five teams.')
  ensure(new Set(teams.map((team) => team.id)).size === teams.length, 'Team IDs must be unique.')
  const state: EngineState = {
    version: 1, revision: 0, status: 'playing', config: structuredClone(config),
    teams: teams.map((team) => ({ ...team, balance: cents(config.initialBalance), stars: 0 })),
    gameIndex: GAME_ORDER.indexOf(startingGame), round: 1, current: { game: startingGame, phase: 'ready', token: env.token() },
    history: [], caveTotals: {}, advantagedTeamId: null, pot: { amount: '0', target: '0' }, potSpent: {}, moneyTransfers: [], reveal: null,
  }
  captureGameStart(state)
  const events: EngineEvent[] = [
    { type: 'playthrough.started', data: { teams: structuredClone(state.teams), config: structuredClone(state.config) } },
    { type: 'round.ready', data: { game: startingGame, round: state.round } },
  ]
  return { state, events }
}
export function startRoundEngine(state: EngineState, env: EngineEnv): EngineEvent[] {
  ensure(state.status === 'playing' && state.current.phase === 'ready', 'This round is not waiting to start.')
  ensure(!state.reveal, 'All teams must acknowledge the rankings reveal first.')
  return startRound(state, env)
}
export function advanceEngine(state: EngineState, env: EngineEnv): EngineEvent[] {
  ensure(state.status === 'playing' && state.current.phase === 'complete', 'Finish this round before advancing.')
  ensure(!state.reveal, 'All teams must acknowledge the rankings reveal first.')
  const startsNewGame = state.round === 3
  if (!startsNewGame) state.round += 1
  else { state.gameIndex += 1; state.round = 1 }
  if (state.gameIndex === GAME_ORDER.length) {
    state.status = 'finished'; state.gameIndex = GAME_ORDER.length - 1; state.round = 3; state.current.token = env.token()
    return [{ type: 'playthrough.finished', data: { rankings: rankings(state) } }]
  }
  if (startsNewGame) captureGameStart(state)
  return startRound(state, env)
}
export function resetCurrentGame(state: EngineState, env: EngineEnv): EngineEvent[] {
  if (!state.gameStart && state.round === 1 && state.status === 'playing'
    && !state.history.some((result) => result.game === state.current.game)
    && state.pot.amount === '0' && Object.keys(state.potSpent ?? {}).length === 0
    && (state.moneyTransfers ?? []).length === 0
    && (state.current.phase === 'ready' || state.current.game !== 'circle' || (Object.keys(state.current.transfers).length === 0 && Object.keys(state.current.returns).length === 0))) {
    if (state.current.game === 'cave') {
      for (const team of state.teams) team.balance = moneySub(team.balance, state.caveTotals[team.id] ?? '0')
      state.caveTotals = {}
    }
    captureGameStart(state)
  }
  const checkpoint = state.gameStart
  ensure(checkpoint, 'This playthrough does not have a saved start point for the current game. Start a new playthrough to use current-game reset.')
  ensure(checkpoint.gameIndex === state.gameIndex, 'The saved start point does not match the current game.')
  const game = GAME_ORDER[state.gameIndex] as GameId
  const previousRound = state.round
  for (const team of state.teams) {
    const account = checkpoint.accounts[team.id]
    ensure(account, 'The saved start point is missing a team account.')
    team.balance = account.balance
    team.stars = account.stars
  }
  state.history = state.history.slice(0, checkpoint.historyLength)
  state.caveTotals = structuredClone(checkpoint.caveTotals)
  state.advantagedTeamId = checkpoint.advantagedTeamId
  state.pot = structuredClone(checkpoint.pot)
  state.potSpent = structuredClone(checkpoint.potSpent)
  state.reveal = structuredClone(checkpoint.reveal)
  state.moneyTransfers = (state.moneyTransfers ?? []).slice(0, checkpoint.moneyTransfersLength ?? 0)
  state.round = 1
  state.status = 'playing'
  state.current = { game, phase: 'ready', token: env.token() }
  return [
    { type: 'game.reset', data: { game, previousRound, preservedRounds: checkpoint.historyLength } },
    { type: 'round.ready', data: { game, round: state.round } },
  ]
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
  if (action.type === 'money.transfer') {
    ensure(action.recipientTeamIds.length >= 1 && action.recipientTeamIds.length < state.teams.length, 'Choose one or more other teams to receive the transfer.')
    ensure(new Set(action.recipientTeamIds).size === action.recipientTeamIds.length, 'Choose each recipient team only once.')
    ensure(!action.recipientTeamIds.includes(teamId), 'Choose a different team to receive the transfer.')
    const recipients = action.recipientTeamIds.map((recipientTeamId) => teamById(state, recipientTeamId))
    const amount = cents(action.amount)
    ensure(moneyCompare(amount, '0') > 0, 'Transfer a positive amount.')
    ensure(moneyCompare(amount, team.balance) <= 0, 'Transfer exceeds your available balance.')
    ensure(BigInt(amount) >= BigInt(recipients.length), 'The total must provide at least one cent to each recipient.')
    const orderedRecipients = recipients.sort((a, b) => a.tieOrder - b.tieOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const baseShare = BigInt(amount) / BigInt(orderedRecipients.length)
    const remainder = BigInt(amount) % BigInt(orderedRecipients.length)
    const transfers = orderedRecipients.map((recipient, index) => {
      const share = (baseShare + (BigInt(index) < remainder ? 1n : 0n)).toString()
      return {
        receipt: { id: env.token(), fromTeamId: teamId, toTeamId: recipient.id, amount: share },
        recipientBalance: safeMoney(moneyAdd(recipient.balance, share)),
      }
    })
    const senderBalance = moneySub(team.balance, amount)
    state.moneyTransfers ??= []
    const events = transfers.map(({ receipt, recipientBalance }) => {
      teamById(state, receipt.toTeamId).balance = recipientBalance
      state.moneyTransfers!.push(receipt)
      return { type: 'money.transferred', data: { ...receipt } }
    })
    team.balance = senderBalance
    return events
  }
  ensure(state.current.phase !== 'ready', 'The host has not started this round.')
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
