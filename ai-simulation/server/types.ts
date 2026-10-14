import type { GameConfig, GameId, GameAction, PlayerGameView } from 'backend/game'

export type RunOptions = {
  teamCount: number; seed: number; mode: 'scripted' | 'openai'; hostModel: string; playerModel: string
  minDiscussionBeats: number; maxDiscussionBeats: number; caveDiscussionBeats: number
  maxTokens: number; maxSteps: number; maxWallTimeMs: number
}
export type RunStatus = 'created' | 'running' | 'paused' | 'stopping' | 'stopped' | 'finished' | 'failed'
export type RunEvent = {
  id: string; runId: string; sequence: number; audience: 'public' | 'observer' | string
  type: string; text?: string; data?: Record<string, unknown>; game?: GameId; round?: number
  logicalTime?: number; wallTime: string
}
export type AgentRecord = { id: string; name: string; teamId: string; playerId: string; email: string; credential: string }
export type RunRecord = {
  id: string; name: string; status: RunStatus; createdAt: string; updatedAt: string; options: RunOptions
  config: GameConfig; sessionId?: string; agents: AgentRecord[]; events: RunEvent[]; cursor: number
  stepCount: number; tokensUsed: number; error?: string; revision: number; abortEpoch: number
  elapsedMs: number
  memories: Record<string, Array<{ role: 'assistant' | 'tool'; content: unknown }>>
}
export type PublicAgent = Pick<AgentRecord, 'id' | 'name' | 'teamId'>
export type RunSummary = Omit<RunRecord, 'agents' | 'events' | 'memories' | 'config' | 'options'> & {
  config?: GameConfig; options: Omit<RunOptions, 'seed'> & { seed?: number }; agents: PublicAgent[]; eventCount: number
}
export type RunDetail = { summary: RunSummary; events: RunEvent[]; transcript: RunEvent[]; agents: Array<{ agent: PublicAgent; view?: PlayerGameView; privateEvents: RunEvent[] }> }
export type CreateRunRequest = { name?: string; config: GameConfig; options: Partial<RunOptions> }
export type PlayerAction = { agentId: string; action: GameAction }
