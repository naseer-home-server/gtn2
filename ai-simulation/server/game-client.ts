import { randomUUID } from 'node:crypto'
import { gameApiBaseUrl, serviceKey } from './config.js'
import type { AgentRecord } from './types.js'
import type { GameAction, GameConfig, PlayerGameView } from 'backend/game'

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${gameApiBaseUrl}${url}`, {
        ...init, signal, headers: { 'content-type': 'application/json', 'x-simulation-service-key': serviceKey, ...init.headers },
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const error = new Error(`Game API ${response.status}: ${body?.error || body?.message || response.statusText}`)
        if (response.status >= 500 && attempt < 2) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1))); continue }
        throw error
      }
      return body as T
    } catch (error) {
      lastError = error
      if (signal.aborted || attempt >= 2) throw error
      if (error instanceof Error && error.message.startsWith('Game API 4')) throw error
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
    }
  }
  throw lastError
}
export type SessionInfo = { sessionId: string; players: AgentRecord[] }
type RawSessionInfo = { sessionId: string; players: Array<{ agentId: string; name: string; teamId: string; playerId: string; email: string; credential: string }> }
export type ServiceView = { sessionId: string; status: string; revision: number; logicalTime: number; state: any; events: any[] }
export async function createSession(name: string, teamCount: number, seed: number, config: GameConfig, requestId: string): Promise<SessionInfo> {
  const session = await request<RawSessionInfo>('/api/simulation/sessions', { method: 'POST', body: JSON.stringify({ requestId, name, teamCount, seed, config }) })
  return { ...session, players: session.players.map(({ agentId, ...agent }) => ({ ...agent, id: agentId })) }
}
export function getServiceView(sessionId: string, signal?: AbortSignal) { return request<ServiceView>(`/api/simulation/sessions/${encodeURIComponent(sessionId)}`, { signal }) }
export function controlSession(sessionId: string, operation: 'start' | 'advance' | 'tick', expectedToken?: string, requestId: string = randomUUID(), signal?: AbortSignal) {
  return request<ServiceView>(`/api/simulation/sessions/${encodeURIComponent(sessionId)}/control`, { method: 'POST', signal, body: JSON.stringify({ requestId, operation, ...(expectedToken ? { expectedToken } : {}) }) })
}
export function getPlayerView(sessionId: string, agent: AgentRecord, signal?: AbortSignal) {
  return request<PlayerGameView>(`/api/simulation/sessions/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(agent.id)}/state`, { signal, headers: { authorization: `Bearer ${agent.credential}` } })
}
export function playerAction(sessionId: string, agent: AgentRecord, token: string, action: GameAction, requestId: string = randomUUID(), signal?: AbortSignal) {
  return request<PlayerGameView>(`/api/simulation/sessions/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(agent.id)}/actions`, {
    method: 'POST', signal, headers: { authorization: `Bearer ${agent.credential}` }, body: JSON.stringify({ requestId, token, action }),
  })
}
export function createDirectChat(sessionId: string, agent: AgentRecord, teamId: string, signal?: AbortSignal) {
  return request<{ id: string }>(`/api/simulation/sessions/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(agent.id)}/chat/direct`, {
    method: 'POST', signal, headers: { authorization: `Bearer ${agent.credential}` }, body: JSON.stringify({ teamId }),
  })
}
export function sendPrivateChat(sessionId: string, agent: AgentRecord, conversationId: string, text: string, clientMessageId: string, signal?: AbortSignal) {
  return request<{ text: string; sequence: number }>(`/api/simulation/sessions/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(agent.id)}/chat/send`, {
    method: 'POST', signal, headers: { authorization: `Bearer ${agent.credential}` }, body: JSON.stringify({ conversationId, text, clientMessageId }),
  })
}
