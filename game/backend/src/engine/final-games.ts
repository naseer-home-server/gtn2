import { cents, chooseWinner, ensure, integer, moneyAdd, moneyCompare, moneyDivide, moneyMultiply, moneySub, safeMoney, teamById, units } from './helpers.js'
import type { BombChoice, CircleRound, EngineEnv, EngineEvent, EngineState, GameAction, Team, Transfer } from './types.js'
import { MIN_TEAMS, MAX_TEAMS } from './limits.js'

const circleGameIndex = 3
const bombGameIndex = 4

function randomIndex(env: EngineEnv, length: number): number {
  ensure(length > 0, 'Cannot choose from an empty set.')
  const value = env.random()
  ensure(Number.isFinite(value) && value >= 0 && value < 1, 'Random source must return a value from 0 inclusive to 1 exclusive.')
  return Math.floor(value * length)
}

function shuffle<T>(items: T[], env: EngineEnv): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(env, i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function circleGroups(teams: Team[], env: EngineEnv): Team[][] {
  ensure(teams.length >= MIN_TEAMS && teams.length <= MAX_TEAMS, `Circle requires ${MIN_TEAMS} to ${MAX_TEAMS} teams.`)
  const shuffled = shuffle(teams, env)
  if (shuffled.length <= 3) return [shuffled]
  if (shuffled.length > 5) {
    const partitions = (remaining: number, minimum = 2): number[][] => {
      const result: number[][] = [[remaining]]
      for (let size = minimum; size <= Math.floor(remaining / 2); size++) {
        for (const rest of partitions(remaining - size, size)) result.push([size, ...rest])
      }
      return result
    }
    const sizes = partitions(shuffled.length)
    const selected = sizes[randomIndex(env, sizes.length)]
    let offset = 0
    return selected.map(size => { const group = shuffled.slice(offset, offset + size); offset += size; return group })
  }
  // Keep the seeded grouping behavior of existing two- to five-team runs.
  const split = randomIndex(env, 2) === 0
  if (!split) return [shuffled]
  const firstSize = shuffled.length === 4 ? 2 : 3
  return [shuffled.slice(0, firstSize), shuffled.slice(firstSize)]
}

function positiveMultiplier(value: number): number {
  ensure(Number.isSafeInteger(value) && value > 0, 'Transfer multiplier must be a positive whole number.')
  return value
}

function signedMoney(value: string): string {
  ensure(/^-?\d+$/.test(value), 'Money exceeds the supported range.')
  return BigInt(value).toString()
}

function finishSignedRound(state: EngineState, payouts: Record<string, string>, details: Record<string, unknown>, events: EngineEvent[]) {
  ensure(state.current.phase !== 'complete', 'Round is already complete.')
  state.current.phase = 'complete'
  state.history.push({ game: state.current.game, round: state.round, payouts, details })
  events.push({ type: 'round.completed', data: { game: state.current.game, round: state.round, payouts, ...details } })
}

export function startFinalGame(state: EngineState, env: EngineEnv): EngineEvent[] {
  ensure(state.status === 'playing', 'Session is not playing.')
  ensure(state.teams.length >= MIN_TEAMS && state.teams.length <= MAX_TEAMS, `Final games require ${MIN_TEAMS} to ${MAX_TEAMS} teams.`)
  const token = env.token()
  if (state.gameIndex === circleGameIndex) {
    const groups = circleGroups(state.teams, env)
    const next: Record<string, string> = {}
    const sender: Record<string, string> = {}
    for (const group of groups) {
      for (let i = 0; i < group.length; i++) {
        const team = group[i]
        const recipient = group[(i + 1) % group.length]
        next[team.id] = recipient.id
        sender[recipient.id] = team.id
      }
    }
    state.current = { game: 'circle', token, phase: 'transfer', next, sender, transfers: {}, returns: {}, received: {}, returned: {} }
    return [{ type: 'circle.started', data: { round: state.round, token, circles: groups.map((group) => group.map((team) => team.id)), next, sender } }]
  }
  ensure(state.gameIndex === bombGameIndex, 'Final game index is invalid.')
  let events: EngineEvent[] = []
  if (state.advantagedTeamId === null) {
    state.advantagedTeamId = chooseWinner(state, Object.fromEntries(state.teams.map((team) => [team.id, team.stars])))
    events.push({ type: 'bomb.advantage_revealed', data: { teamId: state.advantagedTeamId, maxChitsPerPile: state.config.bomb.advantageChits } })
  }
  state.current = { game: 'bomb', token, phase: 'choices', choices: {}, recipient: null, direction: null }
  events.push({ type: 'bomb.started', data: { round: state.round, token } })
  return events
}

function blankTransfer(): Transfer { return { money: '0', stars: 0 } }
function safeStars(value: number) { ensure(Number.isSafeInteger(value) && value >= 0, 'Star total exceeds the supported range.'); return value }

export function actFinalGame(state: EngineState, teamId: string, action: GameAction, env: EngineEnv): EngineEvent[] {
  ensure(state.current.phase !== 'ready', 'The host has not started this round.')
  const team = teamById(state, teamId)
  const events: EngineEvent[] = []
  if (state.current.game === 'circle') {
    const round = state.current as CircleRound
    const multiplier = positiveMultiplier(state.config.circle.multiplier[state.round - 1])
    if (action.type === 'circle.send') {
      ensure(round.phase === 'transfer', 'Circle is not accepting outgoing transfers.')
      ensure(!round.transfers[teamId], 'Team already sent this round.')
      const money = cents(action.money)
      const stars = integer(action.stars)
      ensure(moneyCompare(money, team.balance) <= 0, 'Transfer exceeds the current balance.')
      ensure(stars <= team.stars, 'Transfer exceeds the current star balance.')
      team.balance = moneySub(team.balance, money)
      team.stars = safeStars(team.stars - stars)
      round.transfers[teamId] = { money, stars }
      events.push({ type: 'circle.transfer_submitted', data: { teamId } })
      if (Object.keys(round.transfers).length === state.teams.length) {
        for (const senderTeam of state.teams) {
          const sent = round.transfers[senderTeam.id]
          const recipientId = round.next[senderTeam.id]
          const recipient = teamById(state, recipientId)
          const incoming = { money: moneyMultiply(sent.money, multiplier), stars: safeStars(sent.stars * multiplier) }
          recipient.balance = safeMoney(moneyAdd(recipient.balance, incoming.money))
          recipient.stars = safeStars(recipient.stars + incoming.stars)
          round.received[recipientId] = incoming
          events.push({ type: 'circle.transfer_received', data: { teamId: recipientId, senderId: senderTeam.id, money: units(incoming.money), stars: incoming.stars } })
        }
        round.phase = 'return'
        round.token = env.token()
        events.push({ type: 'circle.returns_opened', data: { token: round.token } })
      }
      return events
    }
    if (action.type === 'circle.return') {
      ensure(round.phase === 'return', 'Circle is not accepting returns.')
      ensure(!round.returns[teamId], 'Team already returned this round.')
      const money = cents(action.money)
      const stars = integer(action.stars)
      ensure(moneyCompare(money, team.balance) <= 0, 'Return exceeds the current balance.')
      ensure(stars <= team.stars, 'Return exceeds the current star balance.')
      team.balance = moneySub(team.balance, money)
      team.stars = safeStars(team.stars - stars)
      round.returns[teamId] = { money, stars }
      events.push({ type: 'circle.return_submitted', data: { teamId } })
      if (Object.keys(round.returns).length === state.teams.length) {
        for (const recipient of state.teams) {
          const returned = round.returns[recipient.id]
          const senderId = round.sender[recipient.id]
          const sender = teamById(state, senderId)
          sender.balance = safeMoney(moneyAdd(sender.balance, returned.money))
          sender.stars = safeStars(sender.stars + returned.stars)
          round.returned[senderId] = { money: moneyAdd(round.returned[senderId]?.money ?? '0', returned.money), stars: (round.returned[senderId]?.stars ?? 0) + returned.stars }
          events.push({ type: 'circle.return_received', data: { teamId: senderId, fromTeamId: recipient.id, money: units(returned.money), stars: returned.stars } })
        }
        const payouts: Record<string, string> = {}
        const netStars: Record<string, number> = {}
        const flow: Record<string, unknown> = {}
        for (const participant of state.teams) {
          const sent = round.transfers[participant.id]
          const received = round.received[participant.id] ?? blankTransfer()
          const returnedToTeam = round.returned[participant.id] ?? blankTransfer()
          const returnedOut = round.returns[participant.id]
          payouts[participant.id] = signedMoney(moneySub(moneyAdd(received.money, returnedToTeam.money), moneyAdd(sent.money, returnedOut.money)))
          netStars[participant.id] = received.stars + returnedToTeam.stars - sent.stars - returnedOut.stars
          flow[participant.id] = {
            sent: { money: units(sent.money), stars: sent.stars },
            received: { money: units(received.money), stars: received.stars },
            returned: { money: units(returnedOut.money), stars: returnedOut.stars },
            returnedToTeam: { money: units(returnedToTeam.money), stars: returnedToTeam.stars },
          }
        }
        finishSignedRound(state, payouts, { transfers: flow, netStars }, events)
      }
      return events
    }
    ensure(false, 'Action does not apply to the circle game.')
  }

  ensure(state.current.game === 'bomb', 'Action does not apply to a final game.')
  const round = state.current
  ensure(round.game === 'bomb', 'Action does not apply to the bomb game.')
  ensure(action.type === 'bomb.allocate', 'Action does not apply to the bomb game.')
  ensure(round.phase === 'choices', 'Bomb is not accepting allocations.')
  ensure(!round.choices[teamId], 'Team already allocated this round.')
  const maxChits = teamId === state.advantagedTeamId ? state.config.bomb.advantageChits : state.config.bomb.maxChits
  const minChits = integer(state.config.bomb.minChits, 1)
  integer(maxChits, minChits)
  const up = integer(action.up)
  const down = integer(action.down)
  ensure(up + down >= minChits && up + down <= maxChits, `Total chits must be between ${minChits} and ${maxChits}.`)
  let recipientTotal = 0
  for (const [recipientId, count] of Object.entries(action.recipients)) {
    teamById(state, recipientId)
    integer(count)
    recipientTotal = safeStars(recipientTotal + count)
  }
  ensure(recipientTotal >= minChits && recipientTotal <= maxChits, `Recipient chits must total between ${minChits} and ${maxChits}.`)
  const choice: BombChoice = { up, down, recipients: { ...action.recipients } }
  round.choices[teamId] = choice
  events.push({ type: 'bomb.allocation_submitted', data: { teamId } })
  if (Object.keys(round.choices).length !== state.teams.length) return events

  const directionWeights = { up: 0, down: 0 }
  const recipientWeights: Record<string, number> = Object.fromEntries(state.teams.map((item) => [item.id, 0]))
  for (const submission of Object.values(round.choices)) {
    directionWeights.up = safeStars(directionWeights.up + submission.up)
    directionWeights.down = safeStars(directionWeights.down + submission.down)
    for (const [recipientId, count] of Object.entries(submission.recipients)) recipientWeights[recipientId] = safeStars(recipientWeights[recipientId] + count)
  }
  const direction = weightedChoice(directionWeights, env) as 'up' | 'down'
  const recipientId = weightedChoice(recipientWeights, env)
  const recipient = teamById(state, recipientId)
  const before = recipient.balance
  const factor = state.config.bomb.factor[state.round - 1]
  ensure(Number.isFinite(factor) && factor > 0, 'Bomb factor must be positive.')
  recipient.balance = safeMoney(direction === 'up' ? moneyMultiply(recipient.balance, factor) : moneyDivide(recipient.balance, factor))
  const delta = signedMoney(moneySub(recipient.balance, before))
  round.recipient = recipientId
  round.direction = direction
  const payouts: Record<string, string> = Object.fromEntries(state.teams.map((item) => [item.id, item.id === recipientId ? delta : '0']))
  const result = { teamId: recipientId, direction, factor, before: units(before), after: units(recipient.balance), delta: units(delta) }
  finishSignedRound(state, payouts, { outcome: result }, events)
  events.push({ type: 'bomb.resolved', data: result })
  return events
}

function weightedChoice(weights: Record<string, number>, env: EngineEnv): string {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0)
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  ensure(Number.isSafeInteger(total) && total > 0, 'Cannot draw from an empty pile.')
  let target = randomIndex(env, total)
  for (const [id, weight] of entries) {
    if (target < weight) return id
    target -= weight
  }
  return entries.at(-1)![0]
}

