import { cents, moneyMultiply, units } from './helpers.js'
import { rankings } from './index.js'
import type { EngineState, PlayerGameView, PublicTeam, Team } from './types.js'

const publicTeam = (team: Team): PublicTeam => ({ id: team.id, name: team.name, stars: team.stars })
export function playerView(sessionId: string, sessionName: string, state: EngineState | null, playerId: string): PlayerGameView {
  const team = state?.teams.find((item) => item.playerIds.includes(playerId))
  const base: PlayerGameView = {
    sessionId, sessionName, status: state?.status ?? 'waiting', isTeamLeader: false, team: null,
    teams: state?.teams.map(publicTeam) ?? [], game: state?.current.game ?? null, round: state?.round ?? null,
    token: null, pot: { amount: state ? units(state.pot.amount) : '0.00', target: state ? units(state.pot.target) : '0.00' },
    reveal: null, earnings: [], roundState: null, allowedActions: [],
  }
  if (!state || !team) return base
  base.isTeamLeader = (team.leaderPlayerId ?? team.playerIds[0]) === playerId
  base.team = { id: team.id, name: team.name, balance: units(team.balance), stars: team.stars, rank: rankings(state).find((item) => item.teamId === team.id)!.rank }
  base.token = state.current.token
  base.earnings = state.history.map((result) => ({ game: result.game, round: result.round, amount: units(result.payouts[team.id] ?? '0') }))
  const current = state.current
  const i = state.round - 1
  if (current.game === 'bonus') base.rules = { bag: state.config.bonus.bag[i], threshold: state.config.bonus.threshold[i], multiplier: state.config.bonus.multiplier[i], roundThreeStars: state.config.bonus.stars }
  if (current.game === 'high-low') base.rules = { pool: state.config.highLow.pool[i], multiplier: state.config.highLow.multiplier[i], roundThreeStars: state.config.highLow.stars }
  if (current.game === 'cave') base.rules = { startingMoney: state.config.cave.startingMoney[i], growth: state.config.cave.growth[i], tickSeconds: state.config.cave.tickSeconds, collapseRisk: state.config.cave.collapseRisk, gameStars: state.config.cave.stars }
  if (current.game === 'circle') base.rules = { multiplier: state.config.circle.multiplier[i] }
  if (current.game === 'bomb') {
    base.rules = { factor: state.config.bomb.factor[i] }
    base.finaleAdvantage = { teamId: state.advantagedTeamId!, maxChitsPerPile: state.config.bomb.advantageChits, standardMaxChits: state.config.bomb.maxChits }
  }
  if (current.phase === 'ready') {
    base.roundState = { phase: 'ready', submitted: false }
    return base
  }
  base.roundState = { phase: current.phase, submitted: false }
  if (current.game === 'bonus' || current.game === 'high-low') {
    base.roundState.submitted = current.choices[team.id] !== undefined
    base.roundState.choiceLimit = current.game === 'bonus' ? units(cents(state.config.bonus.bag[state.round - 1])) : units(moneyMultiply(cents(state.config.highLow.pool[state.round - 1]), state.config.highLow.multiplier[state.round - 1]))
    if (current.phase === 'choices' && !base.roundState.submitted) base.allowedActions.push(current.game === 'bonus' ? 'bonus.take' : 'high-low.choose')
  } else if (current.game === 'cave') {
    const hasLeft = !current.inside.includes(team.id)
    base.roundState.hasLeft = hasLeft
    base.roundState.unbanked = hasLeft || current.phase === 'complete' ? '0.00' : units(current.unbanked)
    base.roundState.phase = current.phase === 'complete' ? 'complete' : hasLeft ? 'waiting' : current.stage === 'waiting' ? 'cave-waiting' : 'cave-decisions'
    base.roundState.submitted = current.decisions[team.id] !== undefined
    if (current.phase === 'cave') base.roundState.nextTickAt = state.reveal ? null : current.nextTickAt
    if (!hasLeft && current.stage === 'decisions' && current.phase === 'cave' && !base.roundState.submitted) base.allowedActions.push('cave.decide')
  } else if (current.game === 'circle') {
    base.roundState.submitted = (current.phase === 'transfer' ? current.transfers : current.returns)[team.id] !== undefined
    if (current.phase !== 'transfer') {
      const sender = state.teams.find((item) => item.id === current.sender[team.id])!
      base.roundState.sender = publicTeam(sender)
      const received = current.received[team.id]
      if (received) base.roundState.received = { money: units(received.money), stars: received.stars }
    }
    if (current.phase === 'transfer' && !base.roundState.submitted) base.allowedActions.push('circle.send')
    if (current.phase === 'return' && !base.roundState.submitted) base.allowedActions.push('circle.return')
    // Return source would identify the hidden outgoing recipient; only the amount is exposed.
    const returned = current.returned[team.id]
    if (returned) base.roundState.returned = { money: units(returned.money), stars: returned.stars }
  } else {
    base.roundState.submitted = current.choices[team.id] !== undefined
    base.roundState.minChits = state.config.bomb.minChits
    base.roundState.maxChits = team.id === state.advantagedTeamId ? state.config.bomb.advantageChits : state.config.bomb.maxChits
    if (current.recipient) base.roundState.bombRecipient = publicTeam(state.teams.find((item) => item.id === current.recipient)!)
    if (current.recipient === team.id && current.direction) base.roundState.bombDirection = current.direction
    if (current.phase === 'choices' && !base.roundState.submitted) base.allowedActions.push('bomb.allocate')
  }
  if (state.pot.target !== '0' && team.balance !== '0') base.allowedActions.push('pot.contribute')
  if (state.status === 'finished') base.allowedActions = base.allowedActions.filter((type) => type === 'pot.contribute')
  if (state.reveal) {
    base.allowedActions = []
    if (!state.reveal.acknowledged.includes(team.id)) {
      base.reveal = { id: state.reveal.id, rankings: state.reveal.rankings }
      base.allowedActions = ['reveal.acknowledge']
    }
  }
  if (!base.isTeamLeader) base.allowedActions = []
  return base
}
