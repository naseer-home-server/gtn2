import { gameConfigSchema } from './config.js'
import { cents, ensure, safeMoney, teamById } from './helpers.js'
import { GAME_ORDER, type EngineEvent, type EngineState, type GameConfig, type GameId } from './types.js'

type ConfigSection = Exclude<keyof GameConfig, 'initialBalance' | 'revealPotMultiplier'>

const configSectionByGame: Record<GameId, ConfigSection> = {
  bonus: 'bonus',
  'high-low': 'highLow',
  cave: 'cave',
  circle: 'circle',
  bomb: 'bomb',
}

function sameValue(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return canonical(left) === canonical(right)
}

function upcomingGame(state: EngineState): GameId {
  ensure(state.status === 'playing', 'The playthrough is not accepting configuration changes.')
  if (state.current.phase === 'ready' && state.round === 1) return state.current.game
  ensure(state.current.phase === 'complete' && state.round === 3, 'Configuration can only change before a game starts.')
  const nextGame = GAME_ORDER[state.gameIndex + 1]
  ensure(nextGame, 'There is no upcoming game to configure.')
  return nextGame
}

/** Apply one upcoming game's settings and the reveal-price multiplier to a prepared engine state. */
export function applyUpcomingConfig(state: EngineState, requested: GameConfig): EngineEvent[] {
  const game = upcomingGame(state)
  const parsed = gameConfigSchema.parse(requested)
  const section = configSectionByGame[game]

  ensure(parsed.initialBalance === state.config.initialBalance, 'Starting balance is locked after playthrough preparation.')
  for (const key of Object.keys(state.config) as (keyof GameConfig)[]) {
    if (key === 'initialBalance' || key === 'revealPotMultiplier' || key === section) continue
    ensure(sameValue(parsed[key], state.config[key]), `Only ${game} settings and the reveal multiplier can change now.`)
  }

  state.config = {
    ...state.config,
    [section]: structuredClone(parsed[section]),
    revealPotMultiplier: parsed.revealPotMultiplier,
  }

  return [{
    type: 'config.updated',
    data: {
      game,
      section,
      settings: structuredClone(state.config[section]),
      revealPotMultiplier: state.config.revealPotMultiplier,
    },
  }]
}

export type TeamAccountUpdate = {
  teamId: string
  balance: string
  stars: number
  reason?: string
}

/** Set a team's account to absolute values; callers persist the returned audit event atomically. */
export function adjustTeamAccount(state: EngineState, input: TeamAccountUpdate): EngineEvent[] {
  const team = teamById(state, input.teamId)
  ensure(typeof input.balance === 'string' && /^(?:0|[0-9]+)(?:\.[0-9]{1,2})?$/.test(input.balance),
    'Balance must be a nonnegative amount with at most two decimal places.')
  const balance = safeMoney(cents(input.balance))
  ensure(Number.isSafeInteger(input.stars) && input.stars >= 0, 'Stars must be a nonnegative whole number.')
  ensure(input.reason === undefined || typeof input.reason === 'string', 'Reason must be text.')
  const reason = input.reason?.trim()
  ensure(reason === undefined || reason.length <= 300, 'Reason must be 300 characters or fewer.')

  const before = { balance: team.balance, stars: team.stars }
  team.balance = balance
  team.stars = input.stars
  return [{
    type: 'team.account_adjusted',
    data: {
      teamId: team.id,
      game: state.current.game,
      round: state.round,
      status: state.status,
      before,
      after: { balance: team.balance, stars: team.stars },
      ...(reason ? { reason } : {}),
    },
  }]
}
