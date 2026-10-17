import type { RunEvent } from './types.js'

// Local order numbers preserve chronology without exposing other teams' event counts.
export function modelHistory(transcript: RunEvent[], actorId = 'host', privateEvents: RunEvent[] = []) {
  const seen = new Set<string>()
  const visible = [...transcript, ...privateEvents]
    .filter(event => {
      if (seen.has(event.id)) return false
      seen.add(event.id)
      // Current prompts include the authoritative rules card separately. Replaying
      // every prior card and briefing in gameHistory only duplicates that context.
      if (event.type === 'rules.card' || event.type === 'rules.correction' || event.type === 'host.briefing') return false
      const ownRecoveredAction = event.type === 'command.accepted' && event.data?.recovered === true && event.data?.agentId === actorId
      return event.audience === 'public' || (actorId !== 'host' && (event.audience === actorId || ownRecoveredAction))
    })
    .sort((a, b) => a.sequence - b.sequence)
  return visible.flatMap<Record<string, unknown>>(event => {
    const common = { type: event.type, game: event.game, round: event.round, text: event.text }
    const data = event.data || {}
    if (event.audience === 'public') {
      return [{ ...common, visibility: 'public', speaker: data.speakerName, discussionStage: data.discussionStage,
        ...(event.type === 'game.public-state' ? { state: data.state } : {}) }]
    }
    if (event.type === 'player.view-observed' && data.view && typeof data.view === 'object') {
      const { token: _token, sessionId: _sessionId, ...view } = data.view as Record<string, unknown>
      return [{ ...common, visibility: 'private', observation: view }]
    }
    if (event.type === 'action.accepted') return [{ ...common, visibility: 'private', action: data.action, earnings: data.earnings }]
    if (event.type === 'round.feedback') return [{ ...common, visibility: 'private', feedback: data }]
    if (event.type === 'command.accepted' && data.recovered) return [{ ...common, type: 'action.accepted', visibility: 'private', action: data.action }]
    if (event.type === 'chat.private-message') return [{ ...common, visibility: 'private', sender: data.senderName || data.sender,
      senderId: data.senderId, recipientId: data.recipientId }]
    if (event.type === 'reveal.observed' || event.type === 'reveal.acknowledged') {
      return [{ ...common, visibility: 'private', snapshotId: data.snapshotId, scope: data.scope, rankings: data.rankings, rank: data.rank }]
    }
    // Operator diagnostics, validation exchanges, and transport bookkeeping never become model memory.
    return []
  }).map((event, index) => ({ order: index + 1, ...event }))
}
