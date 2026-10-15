import type { RunDetail, RunEvent } from './types'
import { gameActivities, unitsToCents, type AuditEvent, type GameActivity, type ReviewTeam } from '../../../game/frontend/src/components/game-activity/model'

type Snapshot = { teams?: ReviewTeam[]; gameEvents?: AuditEvent[] }
export type TranscriptItem = { id: string; time?: string; activity?: GameActivity; event?: RunEvent }

export function observerAccounts(detail: RunDetail): ReviewTeam[] {
  const snapshots = detail.events.filter(event => event.type === 'game.audit-snapshot')
  const snapshot = snapshots.at(-1)?.data as Snapshot | undefined
  const accounts = detail.audit?.teams ?? snapshot?.teams ?? []
  const final = detail.summary.status === 'finished'
    ? [...detail.events].reverse().find(event => event.type === 'final.standings')?.data?.standings as Array<{ teamId: string; name?: string; balance: string; stars?: number; rank?: number }> | undefined
    : undefined
  if (Array.isArray(final) && final.length) return final.map(team => ({ id: team.teamId,
    name: team.name || detail.summary.agents.find(agent => agent.teamId === team.teamId)?.name || team.teamId,
    balance: unitsToCents(team.balance), stars: team.stars, rank: team.rank }))
  return detail.summary.agents.map(agent => {
    const account = accounts.find(team => team.id === agent.teamId)
    const view = detail.agents.find(item => item.agent.id === agent.id)?.view?.team
    return account || { id: agent.teamId, name: agent.name, balance: unitsToCents(view?.balance), stars: view?.stars }
  })
}

export function observerTranscript(detail: RunDetail, teams = observerAccounts(detail)): TranscriptItem[] {
  const events = detail.events
  const snapshots = events.filter(event => event.type === 'game.audit-snapshot')
  const captured = snapshots.flatMap(snapshot => ((snapshot.data as Snapshot | undefined)?.gameEvents || []).map(event => ({ ...event, createdAt: event.createdAt || snapshot.wallTime })))
  const audit: AuditEvent[] = detail.audit?.events ?? captured
  const seenAudit = new Set<string>()
  const engineEvents: AuditEvent[] = audit.filter(event => {
    const id = event.id || String(event.sequence)
    if (seenAudit.has(id)) return false
    seenAudit.add(id); return true
  })
  // Old stored runs may predate audit snapshots. Accepted commands still retain their choices.
  if (!engineEvents.length) for (const event of events) {
    if (event.type !== 'command.accepted') continue
    const agent = detail.summary.agents.find(agent => agent.id === event.data?.agentId)
    engineEvents.push({ id: event.id, type: 'player.command', game: event.game, round: event.round,
      createdAt: event.wallTime, data: { action: event.data?.action, teamId: agent?.teamId, revision: event.sequence } })
  }
  const activityItems = gameActivities(engineEvents, teams).map(activity => ({ id: activity.id, time: activity.time, activity }))
  const seenChats = new Set<string>()
  let game: RunEvent['game'], round: number | undefined
  const messages = events.flatMap<TranscriptItem>(event => {
    if (event.game && event.game !== game) { game = event.game; round = undefined }
    game = event.game ?? game; round = event.round ?? round
    if (event.type === 'chat.private-message') {
      const key = String(event.data?.clientMessageId || `${event.data?.senderId}:${event.data?.sequence ?? event.id}`)
      if (seenChats.has(key)) return []
      seenChats.add(key)
    } else if (!['player.message', 'host.announcement', 'host.review', 'host.briefing', 'host.round-started', 'discussion.opened', 'rules.card', 'rules.correction',
      'model.validation-error', 'model.context-limit', 'model.request-error', 'model.output-limit'].includes(event.type)) return []
    // Only public conversation, observer diagnostics, and delivered private messages enter this feed.
    if (event.audience !== 'public' && !event.type.startsWith('model.') && event.type !== 'chat.private-message') return []
    const recipient = detail.summary.agents.find(agent => agent.id === event.data?.recipientId)
    return [{ id: event.id, time: event.wallTime, event: { ...event, game: event.game ?? game, round: event.round ?? round,
      data: event.type === 'chat.private-message' ? { ...event.data, recipientName: recipient?.name } : event.data } }]
  })
  return [...activityItems, ...messages].sort((a, b) => (Date.parse(a.time || '') || 0) - (Date.parse(b.time || '') || 0))
}
