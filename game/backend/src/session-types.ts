export type SessionPlayer = { id: string; email: string; arrivalOrder: number | null }
export type GameSession = {
  id: string; name: string; createdAt: string; isActive: boolean
  currentGame: string | null; currentRound: number | null
  players: SessionPlayer[]
}
export type SessionMembership = { sessionId: string; sessionName: string; playerId: string }
export interface GameSessionsRepository {
  list(): Promise<GameSession[]>
  get(id: string): Promise<GameSession>
  create(name: string, emails: string[], actorId: string): Promise<GameSession>
  setActive(id: string | null, actorId: string): Promise<void>
  arrive(sessionId: string, playerId: string, actorId: string): Promise<void>
  reorder(sessionId: string, playerIds: string[], actorId: string): Promise<void>
  membership(email: string): Promise<SessionMembership | null>
}
