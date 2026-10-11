export const GAME_ORDER = ['bonus', 'high-low', 'cave', 'circle', 'bomb'] as const
export type GameId = typeof GAME_ORDER[number]
export type Money = string
export type MoneyInput = string | number
export type Triple<T> = [T, T, T]
export type GameConfig = {
  initialBalance: number
  revealPotMultiplier: number
  bonus: { bag: Triple<number>; threshold: Triple<number>; multiplier: Triple<number>; stars: number }
  highLow: { pool: Triple<number>; multiplier: Triple<number>; stars: number }
  cave: { startingMoney: Triple<number>; growth: Triple<number>; tickSeconds: number; collapseRisk: [number, number, number, number, number]; stars: number }
  circle: { multiplier: Triple<number> }
  bomb: { minChits: number; maxChits: number; advantageChits: number; factor: Triple<number> }
}
// Engine money is integer cents serialized as strings, so cave growth has no numeric ceiling.
// API money values are decimal currency strings; action/config amounts use currency units.
export type Team = { id: string; name: string; playerIds: string[]; leaderPlayerId?: string; tieOrder: number; balance: Money; stars: number }
export type TeamAssignment = { name: string; playerIds: string[] }
export type RoundResult = { game: GameId; round: number; payouts: Record<string, Money>; details: Record<string, unknown> }
export type Ranking = { teamId: string; rank: number }
export type Reveal = { id: string; rankings: Ranking[]; acknowledged: string[] }
export type BaseRound = { token: string; phase: 'choices' | 'transfer' | 'return' | 'cave' | 'complete' }
export type BonusRound = BaseRound & { game: 'bonus'; choices: Record<string, Money> }
export type HighLowRound = BaseRound & { game: 'high-low'; choices: Record<string, Money> }
export type CaveRound = BaseRound & {
  game: 'cave'; tick: number; stage: 'waiting' | 'decisions' | 'ended'; nextTickAt: number | null
  inside: string[]; unbanked: Money; decisions: Record<string, 'stay' | 'leave'>; banked: Record<string, Money>; collapsed: boolean
}
export type Transfer = { money: Money; stars: number }
export type CircleRound = BaseRound & {
  game: 'circle'; next: Record<string, string>; sender: Record<string, string>
  transfers: Record<string, Transfer>; returns: Record<string, Transfer>; received: Record<string, Transfer>; returned: Record<string, Transfer>
}
export type BombChoice = { up: number; down: number; recipients: Record<string, number> }
export type BombRound = BaseRound & { game: 'bomb'; choices: Record<string, BombChoice>; recipient: string | null; direction: 'up' | 'down' | null }
export type CurrentRound = BonusRound | HighLowRound | CaveRound | CircleRound | BombRound
export type EngineState = {
  version: 1; revision: number; status: 'playing' | 'finished'; config: GameConfig
  teams: Team[]; gameIndex: number; round: number; current: CurrentRound
  history: RoundResult[]; caveTotals: Record<string, Money>; advantagedTeamId: string | null
  pot: { amount: Money; target: Money }; reveal: Reveal | null
  potSpent?: Record<string, Money>
}
export type EngineEvent = { type: string; data: Record<string, unknown> }
export type EngineEnv = { now: number; random: () => number; token: () => string }
export type GameAction =
  | { type: 'bonus.take'; amount: MoneyInput }
  | { type: 'high-low.choose'; amount: MoneyInput }
  | { type: 'cave.decide'; decision: 'stay' | 'leave' }
  | { type: 'circle.send'; money: MoneyInput; stars: number }
  | { type: 'circle.return'; money: MoneyInput; stars: number }
  | { type: 'bomb.allocate'; up: number; down: number; recipients: Record<string, number> }
  | { type: 'pot.contribute'; amount: MoneyInput }
  | { type: 'reveal.acknowledge' }
export type PlayerCommand = { requestId: string; token: string; action: GameAction }
export type PublicTeam = { id: string; name: string; stars: number }
export type PlayerGameView = {
  sessionId: string; sessionName: string; status: 'waiting' | 'playing' | 'finished'
  isTeamLeader: boolean
  team: { id: string; name: string; balance: string; stars: number; rank: number } | null
  teams: PublicTeam[]; game: GameId | null; round: number | null; token: string | null
  pot: { amount: string; target: string }; reveal: { id: string; rankings: Ranking[] } | null
  earnings: { game: GameId; round: number; amount: string }[]
  roundState: {
    phase: string; submitted: boolean; choiceLimit?: string
    unbanked?: string; hasLeft?: boolean; nextTickAt?: number | null
    sender?: PublicTeam; received?: { money: string; stars: number }; returned?: { money: string; stars: number }
    minChits?: number; maxChits?: number; bombRecipient?: PublicTeam; bombDirection?: 'up' | 'down'
  } | null
  allowedActions: GameAction['type'][]
  rules?: Record<string, unknown>
  finaleAdvantage?: { teamId: string; maxChitsPerPile: number; standardMaxChits: number }
}
export type SessionEventView = { id: string; actorId: string; type: string; data: Record<string, unknown>; createdAt: string }
export type AdminGameView = { sessionId: string; sessionName: string; state: EngineState | null; events: SessionEventView[] }
export interface GameplayRepository {
  adminView(sessionId: string): Promise<AdminGameView>
  playerView(email: string): Promise<PlayerGameView>
  start(sessionId: string, teams: TeamAssignment[], config: GameConfig, actorId: string): Promise<void>
  advance(sessionId: string, actorId: string): Promise<void>
  action(email: string, command: PlayerCommand, actorId: string): Promise<PlayerGameView>
  tick(): Promise<void>
}
