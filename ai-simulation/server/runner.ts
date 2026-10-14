import { randomUUID } from 'node:crypto'
import { gameConfigSchema, gameActionSchema } from 'backend/engine'
import { appendEvent, getRun, saveRun } from './store.js'
import { createSession, getPlayerView, getServiceView, controlSession, playerAction, createDirectChat, sendPrivateChat, type ServiceView } from './game-client.js'
import { hostLine, playerTurn, scriptedTurn } from './provider.js'
import type { AgentRecord, RunRecord, RunEvent } from './types.js'
import type { PlayerGameView } from 'backend/game'
import { gameRuleCard, globalRuleCard } from './rules.js'
import { providerConfig } from './config.js'

const running = new Set<string>()
const controllers = new Map<string, AbortController>()
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
export function hasBarrierPublicMessage(run: Pick<RunRecord, 'events'>, barrierId: string, agentId: string) {
  return run.events.some((event) => event.audience === 'public' && event.type === 'player.message' && event.data?.barrierId === barrierId && event.data?.speakerId === agentId)
}
export function hasPrivateChatObservation(run: Pick<RunRecord, 'events'>, audience: string, clientMessageId: string) {
  return run.events.some((event) => event.audience === audience && event.type === 'chat.private-message' && event.data?.clientMessageId === clientMessageId)
}
export function runBudgetLimitReached(run: Pick<RunRecord, 'elapsedMs' | 'stepCount' | 'tokensUsed' | 'options'>) {
  if (run.elapsedMs >= run.options.maxWallTimeMs) return 'wall-time'
  if (run.stepCount >= run.options.maxSteps) return 'steps'
  if (run.tokensUsed >= run.options.maxTokens) return 'tokens'
  return undefined
}
async function mapLimit<T, U>(items: T[], limit: number, fn: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const result = new Array<U>(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, async () => {
    while (cursor < items.length) { const index = cursor++; result[index] = await fn(items[index]!, index) }
  }))
  return result
}
async function overTokenBudget(run: RunRecord) {
  if (run.tokensUsed <= run.options.maxTokens) return false
  run.status = 'paused'
  await appendEvent(run, { audience: 'observer', type: 'run.budget-paused', data: { stepCount: run.stepCount, tokensUsed: run.tokensUsed, limit: run.options.maxTokens } })
  return true
}
const orderFor = (count: number, seed: number, step: number) => {
  const offset = (Math.imul(seed ^ step, 0x45d9f3b) >>> 0) % count
  return Array.from({ length: count }, (_, i) => (i + offset) % count)
}
function currentLocation(service: ServiceView) {
  const state = service.state
  return { game: state?.current?.game, round: state?.round, phase: state?.current?.phase }
}
function hostRulesCard(run: RunRecord, service: ServiceView, location = currentLocation(service)) {
  const card = gameRuleCard(location.game, location.round, run.config)
  if (location.game !== 'bomb') return card
  const state = service.state
  const winner = state?.teams.find((team: { id: string; name: string }) => team.id === state.advantagedTeamId)
  if (!winner) return card
  return `${card} Finale advantage revealed: ${winner.name} may allocate up to ${run.config.bomb.advantageChits} chits per pile; every other team may allocate up to ${run.config.bomb.maxChits}. Shared arrival order resolves a tie for most stars.`
}
function isRoundComplete(service: ServiceView) { return service.state?.current?.phase === 'complete' }

export type SessionSetupDependencies = {
  createSession: typeof createSession
  appendEvent: typeof appendEvent
  saveRun: typeof saveRun
}
const defaultSessionSetupDependencies: SessionSetupDependencies = { createSession, appendEvent, saveRun }

export async function ensureSession(run: RunRecord, dependencies = defaultSessionSetupDependencies) {
  if (run.sessionId && run.agents.length) return
  if (!run.events.some((event) => event.type === 'run.created')) {
    await dependencies.appendEvent(run, { audience: 'observer', type: 'run.created', data: { mode: run.options.mode, seed: run.options.seed } })
  }
  const requestId = run.id
  if (!run.events.some((event) => event.type === 'session.create-intent' && event.data?.requestId === requestId)) {
    await dependencies.appendEvent(run, { audience: 'observer', type: 'session.create-intent', data: { requestId, teamCount: run.options.teamCount } })
  }
  const session = await dependencies.createSession(run.name, run.options.teamCount, run.options.seed, run.config, requestId)
  run.sessionId = session.sessionId
  run.agents = session.players
  if (!run.events.some((event) => event.type === 'session.created' && event.data?.requestId === requestId)) {
    await dependencies.appendEvent(run, { audience: 'observer', type: 'session.created', data: { requestId, sessionId: session.sessionId, agentIds: session.players.map((agent) => agent.id) } })
  } else {
    await dependencies.saveRun(run)
  }
}

export async function beginRun(run: RunRecord) {
  run.status = 'running'; await saveRun(run)
  await ensureSession(run)
  void supervise(run.id)
}

async function supervise(runId: string) {
  if (running.has(runId)) return
  running.add(runId)
  const ownerRun = getRun(runId)
  const ownerEpoch = ownerRun?.abortEpoch
  try {
    while (true) {
      const run = getRun(runId)
      if (!run || run.status !== 'running' || run.abortEpoch !== ownerEpoch) return
      const budget = runBudgetLimitReached(run)
      if (budget) {
        run.status = 'paused'
        await appendEvent(run, { audience: 'observer', type: 'run.budget-paused', data: { stepCount: run.stepCount, tokensUsed: run.tokensUsed, budget } })
        return
      }
      const controller = new AbortController()
      controllers.set(runId, controller)
      const started = Date.now()
      try { await stepRun(run, ownerEpoch!, controller.signal) }
      catch (error) { if (!controller.signal.aborted) throw error; return }
      finally {
        run.elapsedMs += Date.now() - started
        if (controllers.get(runId) === controller) controllers.delete(runId)
        await saveRun(run)
      }
      await wait(20)
    }
  } catch (error) {
    const run = getRun(runId)
    if (run?.status === 'running') {
      run.status = 'paused'; run.error = error instanceof Error ? error.message : String(error)
      await appendEvent(run, { audience: 'observer', type: 'run.paused-error', data: { message: run.error } })
    }
  } finally {
    running.delete(runId)
    const run = getRun(runId)
    if (run?.status === 'running') queueMicrotask(() => void supervise(runId))
  }
}

async function hostAnnouncement(run: RunRecord, service: ServiceView, signal: AbortSignal, text?: string) {
  const location = currentLocation(service)
  const previousCard = run.events.findLast((event) => event.type === 'rules.card' && event.game === location.game && event.round === location.round)
  const includeGlobal = !run.events.some((event) => event.type === 'rules.card' && event.audience === 'public')
  const rulesCard = previousCard?.text || [includeGlobal ? globalRuleCard() : '', hostRulesCard(run, service, location)].filter(Boolean).join('\n\n')
  if (!previousCard) await appendEvent(run, { audience: 'public', type: 'rules.card', text: rulesCard, game: location.game, round: location.round })
  let announcement = text || `${location.game || 'Game'} · round ${location.round || 1}. The next phase is ready.`
  if (run.options.mode === 'openai') {
    const gameRules = location.game === 'bonus' ? { bonus: run.config.bonus }
      : location.game === 'high-low' ? { highLow: run.config.highLow }
      : location.game === 'cave' ? { cave: run.config.cave }
      : location.game === 'circle' ? { circle: run.config.circle }
      : location.game === 'bomb' ? { bomb: run.config.bomb } : {}
    const result = await hostLine({ rules: gameRules, rulesCard: hostRulesCard(run, service, location), game: location.game, round: location.round, phase: location.phase, publicProgress: { completedRounds: run.events.filter((e) => e.type === 'round.complete').length } }, run.options, signal)
    if (signal.aborted) return
    run.tokensUsed += result.tokens
    announcement = result.text
    await appendEvent(run, { audience: 'observer', type: 'model.host-usage', game: location.game, round: location.round, data: { tokens: result.tokens } })
    if (signal.aborted) return
    if (await overTokenBudget(run)) return
  }
  if (signal.aborted) return
  await appendEvent(run, { audience: 'public', type: 'host.announcement', text: announcement, game: location.game, round: location.round })
}

async function discussionBeat(run: RunRecord, service: ServiceView, views: PlayerGameView[], epoch: number, signal: AbortSignal) {
  const location = currentLocation(service)
  const window = service.state?.current?.game === 'cave' ? service.state.current.tick : undefined
  const seedBase = run.options.seed ^ (run.stepCount * 101)
  const results = await mapLimit(run.agents, providerConfig.concurrency, async (agent, i) => {
    const view = views[i]!
    const answer = run.options.mode === 'scripted' ? scriptedTurn({ ...view, allowedActions: [] }, seedBase + i) : await playerTurn({ ...view, allowedActions: [] }, run.events, run.options, run.config, false, run.events.filter((e) => e.audience === agent.id), signal)
    return { agent, answer }
  })
  if (run.status !== 'running' || run.abortEpoch !== epoch) return
  run.stepCount++
  for (const result of results) {
    run.tokensUsed += result.answer.tokens
    await appendEvent(run, { audience: 'observer', type: 'model.player-usage', game: location.game, round: location.round, data: { agentId: result.agent.id, tokens: result.answer.tokens, beat: run.stepCount } })
  }
  if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return
  if (await overTokenBudget(run)) return
  const displayOrder = orderFor(results.length, run.options.seed ^ 0x25a5, run.stepCount)
  const barrierId = randomUUID()
  const proposals = displayOrder.map((ix) => {
    const { agent, answer } = results[ix]!
    return { agentId: agent.id, message: answer.message?.slice(0, 1000), privateMessage: answer.privateMessage, privateMessageId: answer.privateMessage ? randomUUID() : undefined }
  })
  const barrier = await appendEvent(run, { audience: 'observer', type: 'barrier.proposed', game: location.game, round: location.round,
    data: { barrierId, kind: 'discussion', window, beat: run.stepCount, messageCount: results.filter((r) => r.answer.message).length, schedulerOrder: proposals.map((p) => p.agentId), proposals } })
  const outcome = await dispatchBarrier(run, barrier, epoch, signal)
  if (outcome === 'done' && run.status === 'running' && run.abortEpoch === epoch) await hostReview(run, service, run.stepCount, window, signal)
}

async function hostReview(run: RunRecord, service: ServiceView, beat: number, window?: number, signal?: AbortSignal) {
  const location = currentLocation(service)
  let review = { text: 'Discussion is closed. Please make your decisions.', continueDiscussion: false, tokens: 0 }
  if (run.options.mode === 'openai') {
    const rules = location.game === 'bonus' ? { bonus: run.config.bonus } : location.game === 'high-low' ? { highLow: run.config.highLow }
      : location.game === 'cave' ? { cave: run.config.cave } : location.game === 'circle' ? { circle: run.config.circle }
        : location.game === 'bomb' ? { bomb: run.config.bomb } : {}
    const discussion = run.events.filter((event) => event.audience === 'public' && event.game === location.game && event.round === location.round).slice(-30)
      .map((event) => ({ type: event.type, speaker: event.data?.speakerName, text: event.text }))
    review = await hostLine({ reviewRequired: true, rulesCard: hostRulesCard(run, service, location), game: location.game, round: location.round, phase: location.phase, rules, discussion }, run.options, signal)
    run.tokensUsed += review.tokens
    await appendEvent(run, { audience: 'observer', type: 'model.host-usage', game: location.game, round: location.round, data: { tokens: review.tokens } })
    if (signal?.aborted) return false
    if (await overTokenBudget(run)) return false
  }
  if (signal?.aborted) return false
  await appendEvent(run, { audience: 'public', type: 'host.review', game: location.game, round: location.round, text: review.text, data: { continueDiscussion: review.continueDiscussion } })
  await appendEvent(run, { audience: 'observer', type: 'host.discussion-decision', game: location.game, round: location.round, data: { beat, window, continueDiscussion: review.continueDiscussion } })
  return review.continueDiscussion
}

async function getViews(run: RunRecord, signal?: AbortSignal) {
  if (!run.sessionId) throw new Error('Simulation session is not ready')
  const views = await Promise.all(run.agents.map((agent) => getPlayerView(run.sessionId!, agent, signal)))
  for (let i = 0; i < views.length; i++) {
    const agent = run.agents[i]!, view = views[i]!
    const latest = [...run.events].reverse().find((event) => event.audience === agent.id && event.type === 'player.view-observed')
    if (JSON.stringify(latest?.data?.view) !== JSON.stringify(view)) {
      await appendEvent(run, { audience: agent.id, type: 'player.view-observed', game: view.game || undefined, round: view.round || undefined, data: { view } })
    }
  }
  return views
}
async function acknowledgeReveals(run: RunRecord, views: PlayerGameView[], epoch: number, signal: AbortSignal) {
  let acknowledged = false
  for (let i = 0; i < views.length; i++) {
    if (run.status !== 'running' || run.abortEpoch !== epoch) return acknowledged
    const view = views[i]!, agent = run.agents[i]!
    if (view.allowedActions.includes('reveal.acknowledge')) {
      await appendEvent(run, { audience: agent.id, type: 'reveal.observed', game: view.game || undefined, round: view.round || undefined, data: { snapshotId: view.reveal?.id, scope: view.reveal?.scope, rankings: view.reveal?.rankings, rank: view.reveal?.rankings.find((item) => item.teamId === view.team?.id)?.rank } })
      const requestId = randomUUID()
      await appendEvent(run, { audience: 'observer', type: 'command.intent', data: { requestId, agentId: agent.id, token: view.token, action: { type: 'reveal.acknowledge' } } })
      await playerAction(run.sessionId!, agent, view.token!, { type: 'reveal.acknowledge' }, requestId, signal)
      const ownRank = view.reveal?.rankings.find((item) => item.teamId === view.team?.id)?.rank
      await appendEvent(run, { audience: agent.id, type: 'reveal.acknowledged', data: { snapshotId: view.reveal?.id, scope: view.reveal?.scope, rankings: view.reveal?.rankings, rank: ownRank } })
      await appendEvent(run, { audience: 'observer', type: 'command.accepted', data: { requestId, agentId: agent.id, action: { type: 'reveal.acknowledge' } } })
      acknowledged = true
    }
  }
  return acknowledged
}

async function decisionBarrier(run: RunRecord, service: ServiceView, views: PlayerGameView[], epoch: number, signal: AbortSignal) {
  const location = currentLocation(service)
  const responses = await mapLimit(run.agents, providerConfig.concurrency, async (agent, i) => {
    const view = views[i]!
    const answer = run.options.mode === 'scripted'
      ? scriptedTurn(view, run.options.seed ^ (run.stepCount * 997) ^ i)
      : await playerTurn(view, run.events, run.options, run.config, true, run.events.filter((e) => e.audience === agent.id), signal)
    return { agent, view, answer }
  })
  if (run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled' as const
  run.stepCount++
  for (const { agent, answer } of responses) {
    run.tokensUsed += answer.tokens
    await appendEvent(run, { audience: 'observer', type: 'model.player-usage', game: location.game, round: location.round, data: { agentId: agent.id, tokens: answer.tokens, beat: run.stepCount } })
  }
  if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled' as const
  if (await overTokenBudget(run)) return 'cancelled' as const
  const order = orderFor(responses.length, run.options.seed ^ 0x5f17, run.stepCount)
  const barrierId = randomUUID()
  const proposals = order.map((ix) => {
    const { agent, view, answer } = responses[ix]!
    const parsed = answer.action ? gameActionSchema.safeParse(answer.action) : undefined
    if (answer.action && (!parsed?.success || !view.allowedActions.includes(answer.action.type))) throw new Error(`${agent.name} proposed an invalid or unavailable action`)
    return { agentId: agent.id, token: view.token, action: parsed?.success ? parsed.data : undefined,
      actionRequestId: answer.action ? randomUUID() : undefined, message: answer.message?.slice(0, 1000),
      privateMessage: answer.privateMessage, privateMessageId: answer.privateMessage ? randomUUID() : undefined }
  })
  const proposed = await appendEvent(run, { audience: 'observer', type: 'barrier.proposed', game: location.game, round: location.round,
    data: { barrierId, kind: 'decision', schedulerOrder: proposals.map((p) => p.agentId), proposals } })
  return dispatchBarrier(run, proposed, epoch, signal)
}

function operationWindow(service: ServiceView) {
  const current = service.state?.current
  return `${current?.game || 'none'}:${service.state?.round || 0}:${current?.phase || 'none'}:${current?.game === 'cave' ? current.tick : ''}`
}

async function operationBarrier(run: RunRecord, service: ServiceView, views: PlayerGameView[], epoch: number, signal: AbortSignal) {
  const location = currentLocation(service)
  const proposals = await mapLimit(run.agents, providerConfig.concurrency, async (agent, i) => {
    const view = views[i]!
    const sideActions = view.allowedActions.filter((action) => action === 'money.transfer' || action === 'pot.contribute')
    if (!sideActions.length) return { agent, view, answer: { tokens: 0 } as { tokens: number; action?: any; message?: string; privateMessage?: { teamId: string; text: string } } }
    const limitedView = { ...view, allowedActions: sideActions }
    const answer = run.options.mode === 'scripted' ? scriptedTurn(limitedView, run.options.seed ^ (run.stepCount * 31) ^ i)
      : await playerTurn(limitedView, run.events, run.options, run.config, true, run.events.filter((e) => e.audience === agent.id), signal)
    return { agent, view: limitedView, answer }
  })
  if (run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled' as const
  run.stepCount++
  for (const { agent, answer } of proposals) {
    run.tokensUsed += answer.tokens
    if (answer.tokens) await appendEvent(run, { audience: 'observer', type: 'model.player-usage', game: location.game, round: location.round, data: { agentId: agent.id, tokens: answer.tokens, phase: 'operations' } })
  }
  if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled' as const
  if (await overTokenBudget(run)) return 'cancelled' as const
  const order = orderFor(proposals.length, run.options.seed ^ 0x1b7, run.stepCount)
  const barrierId = randomUUID()
  const window = operationWindow(service)
  const stored = order.map((ix) => {
    const { agent, answer } = proposals[ix]!
    const parsed = answer.action ? gameActionSchema.safeParse(answer.action) : undefined
    if (answer.action && (!parsed?.success || !['money.transfer', 'pot.contribute'].includes(answer.action.type))) throw new Error(`${agent.name} proposed an invalid side operation`)
    return { agentId: agent.id, token: proposals[ix]!.view.token, action: parsed?.success ? parsed.data : undefined,
      actionRequestId: answer.action ? randomUUID() : undefined, message: answer.message?.slice(0, 1000),
      privateMessage: answer.privateMessage, privateMessageId: answer.privateMessage ? randomUUID() : undefined }
  })
  const barrier = await appendEvent(run, { audience: 'observer', type: 'barrier.proposed', game: location.game, round: location.round,
    data: { barrierId, kind: 'operations', window, schedulerOrder: stored.map((p) => p.agentId), proposals: stored } })
  const outcome = await dispatchBarrier(run, barrier, epoch, signal)
  if (outcome === 'done') await appendEvent(run, { audience: 'observer', type: 'operation.batch.completed', game: location.game, round: location.round, data: { window, barrierId } })
  return outcome
}

async function dispatchBarrier(run: RunRecord, barrier: RunEvent, epoch: number, signal: AbortSignal): Promise<'done' | 'recollect' | 'cancelled'> {
  const data = barrier.data || {}
  const proposals = Array.isArray(data.proposals) ? data.proposals as Array<Record<string, any>> : []
  const barrierId = String(data.barrierId || barrier.id)
  for (const proposal of proposals) {
    if (run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled'
    const agent = run.agents.find((item) => item.id === proposal.agentId)
    if (!agent) throw new Error('Stored barrier references an unknown agent')
    const publicMessageExists = hasBarrierPublicMessage(run, barrierId, agent.id)
    if (proposal.message && !publicMessageExists) {
      await appendEvent(run, { audience: 'public', type: 'player.message', text: proposal.message, game: barrier.game, round: barrier.round, data: { speakerId: agent.id, speakerName: agent.name, barrierId } })
    }
    if (proposal.message && !run.events.some((event) => event.type === 'barrier.message-sent' && event.data?.barrierId === barrierId && event.data?.agentId === agent.id)) {
      await appendEvent(run, { audience: 'observer', type: 'barrier.message-sent', data: { barrierId, agentId: agent.id } })
    }
    if (proposal.privateMessage && !run.events.some((event) => event.type === 'chat.send-accepted' && event.data?.requestId === proposal.privateMessageId)) {
      await sendPrivateMessage(run, agent, proposal.privateMessage.teamId, proposal.privateMessage.text, signal, epoch, proposal.privateMessageId)
    }
    if (!proposal.action || run.events.some((event) => event.type === 'command.accepted' && event.data?.requestId === proposal.actionRequestId)) continue
    const parsed = gameActionSchema.safeParse(proposal.action)
    if (!parsed.success || typeof proposal.token !== 'string' || typeof proposal.actionRequestId !== 'string') throw new Error('Stored barrier action is invalid')
    const fresh = await getPlayerView(run.sessionId!, agent, signal)
    if (run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled'
    if (fresh.token !== proposal.token || !fresh.allowedActions.includes(parsed.data.type)) {
      await appendEvent(run, { audience: 'observer', type: 'barrier.recollected', game: barrier.game, round: barrier.round, data: { barrierId, agentId: agent.id, reason: 'view changed before command dispatch' } })
      return 'recollect'
    }
    await appendEvent(run, { audience: 'observer', type: 'command.intent', game: barrier.game, round: barrier.round,
      data: { requestId: proposal.actionRequestId, agentId: agent.id, action: parsed.data, token: proposal.token, barrierId } })
    if (run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled'
    try {
      const receipt = await playerAction(run.sessionId!, agent, proposal.token, parsed.data, proposal.actionRequestId, signal)
      if (run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled'
      await appendEvent(run, { audience: agent.id, type: 'action.accepted', game: barrier.game, round: barrier.round, data: { action: parsed.data, allowedActions: receipt.allowedActions, earnings: receipt.earnings.filter((e) => e.game === barrier.game && e.round === barrier.round) } })
      await appendEvent(run, { audience: 'observer', type: 'command.accepted', game: barrier.game, round: barrier.round, data: { requestId: proposal.actionRequestId, agentId: agent.id, action: parsed.data } })
    } catch (error) {
      if (run.abortEpoch !== epoch || run.status !== 'running') return 'cancelled'
      const message = error instanceof Error ? error.message : String(error)
      if (/Game API 4\d\d:/.test(message)) {
        await appendEvent(run, { audience: 'observer', type: 'command.rejected', game: barrier.game, round: barrier.round, data: { requestId: proposal.actionRequestId, agentId: agent.id, action: parsed.data, reason: message } })
        await appendEvent(run, { audience: 'observer', type: 'barrier.recollected', game: barrier.game, round: barrier.round, data: { barrierId, agentId: agent.id, reason: 'backend rejected a stale decision' } })
        return 'recollect'
      }
      throw error
    }
  }
  if (data.kind === 'discussion' && !run.events.some((event) => event.type === 'discussion.beat' && event.data?.barrierId === barrierId)) {
    await appendEvent(run, { audience: 'observer', type: 'discussion.beat', game: barrier.game, round: barrier.round,
      data: { beat: data.beat, window: data.window, messageCount: data.messageCount, schedulerOrder: data.schedulerOrder, barrierId } })
  }
  await appendEvent(run, { audience: 'observer', type: 'barrier.completed', game: barrier.game, round: barrier.round, data: { barrierId, kind: data.kind } })
  return 'done'
}

async function sendPrivateMessage(run: RunRecord, sender: AgentRecord, targetTeamId: string, text: string, signal: AbortSignal, epoch: number, stableId = randomUUID()) {
  const receiver = run.agents.find((candidate) => candidate.teamId === targetTeamId)
  if (!receiver || receiver.id === sender.id) throw new Error('Private chat target must be another simulation team')
  const clientMessageId = stableId
  await appendEvent(run, { audience: 'observer', type: 'chat.send-intent', data: { requestId: clientMessageId, senderId: sender.id, recipientId: receiver.id, targetTeamId, clientMessageId, text: text.slice(0, 2000) } })
  if (run.abortEpoch !== epoch || run.status !== 'running') return
  const conversation = await createDirectChat(run.sessionId!, sender, targetTeamId, signal)
  const result = await sendPrivateChat(run.sessionId!, sender, conversation.id, text.slice(0, 2000), clientMessageId, signal)
  if (run.abortEpoch !== epoch || run.status !== 'running') return
  const data = { senderId: sender.id, senderName: sender.name, recipientId: receiver.id, sequence: result.sequence, clientMessageId }
  if (!hasPrivateChatObservation(run, sender.id, clientMessageId) && !run.events.some((event) => event.audience === sender.id && event.type === 'chat.private-message' && event.data?.sequence === result.sequence && event.data?.senderId === sender.id)) {
    await appendEvent(run, { audience: sender.id, type: 'chat.private-message', text: result.text, data })
  }
  if (!hasPrivateChatObservation(run, receiver.id, clientMessageId) && !run.events.some((event) => event.audience === receiver.id && event.type === 'chat.private-message' && event.data?.sequence === result.sequence && event.data?.senderId === sender.id)) {
    await appendEvent(run, { audience: receiver.id, type: 'chat.private-message', text: result.text, data })
  }
  await appendEvent(run, { audience: 'observer', type: 'chat.send-accepted', data: { requestId: clientMessageId, senderId: sender.id, recipientId: receiver.id } })
}

async function recoverPendingIntent(run: RunRecord, epoch: number, signal: AbortSignal) {
  const accepted = new Set(run.events.filter((event) => event.type === 'command.accepted' || event.type === 'command.rejected' || event.type === 'host.command-accepted' || event.type === 'intent.recovered-stale' || event.type === 'chat.send-accepted')
    .map((event) => event.data?.requestId).filter((id): id is string => typeof id === 'string'))
  const chatIntent = [...run.events].reverse().find((event) => event.type === 'chat.send-intent' && typeof event.data?.requestId === 'string' && !accepted.has(String(event.data.requestId)))
  if (chatIntent) {
    const data = chatIntent.data!
    const sender = run.agents.find((agent) => agent.id === data.senderId)
    const receiver = run.agents.find((agent) => agent.id === data.recipientId)
    if (!sender || !receiver || typeof data.targetTeamId !== 'string' || typeof data.requestId !== 'string' || typeof data.text !== 'string') throw new Error('Stored chat intent is incomplete')
    const conversation = await createDirectChat(run.sessionId!, sender, data.targetTeamId, signal)
    const result = await sendPrivateChat(run.sessionId!, sender, conversation.id, data.text, data.requestId, signal)
    if (run.abortEpoch !== epoch || run.status !== 'running') return true
    const clientMessageId = typeof data.clientMessageId === 'string' ? data.clientMessageId : data.requestId
    const payload = { senderId: sender.id, senderName: sender.name, recipientId: receiver.id, sequence: result.sequence, clientMessageId }
    if (!hasPrivateChatObservation(run, sender.id, clientMessageId) && !run.events.some((event) => event.audience === sender.id && event.type === 'chat.private-message' && event.data?.sequence === result.sequence && event.data?.senderId === sender.id)) {
      await appendEvent(run, { audience: sender.id, type: 'chat.private-message', text: result.text, data: payload })
    }
    if (!hasPrivateChatObservation(run, receiver.id, clientMessageId) && !run.events.some((event) => event.audience === receiver.id && event.type === 'chat.private-message' && event.data?.sequence === result.sequence && event.data?.senderId === sender.id)) {
      await appendEvent(run, { audience: receiver.id, type: 'chat.private-message', text: result.text, data: payload })
    }
    await appendEvent(run, { audience: 'observer', type: 'chat.send-accepted', data: { requestId: data.requestId, senderId: sender.id, recipientId: receiver.id, recovered: true } })
    return true
  }
  const playerIntent = [...run.events].reverse().find((event) => event.type === 'command.intent' && typeof event.data?.requestId === 'string' && !accepted.has(String(event.data.requestId)))
  if (playerIntent) {
    const data = playerIntent.data!
    const actor = run.agents.find((agent) => agent.id === data.agentId)
    if (!actor || typeof data.token !== 'string' || !data.action || typeof data.requestId !== 'string') throw new Error('Stored player command intent is incomplete')
    try {
      await playerAction(run.sessionId!, actor, data.token, data.action as any, data.requestId, signal)
      if (run.abortEpoch !== epoch || run.status !== 'running') return true
      await appendEvent(run, { audience: 'observer', type: 'command.accepted', data: { requestId: data.requestId, agentId: actor.id, action: data.action, recovered: true } })
      return true
    } catch (error) {
      if (run.abortEpoch !== epoch || run.status !== 'running') return true
      const message = error instanceof Error ? error.message : String(error)
      if (/earlier round|earlier tick|outdated|stale|refresh your state|window has closed/i.test(message)) {
        await appendEvent(run, { audience: 'observer', type: 'intent.recovered-stale', data: { requestId: data.requestId, agentId: actor.id, reason: message } })
        return true
      }
      throw error
    }
  }
  const controlIntent = [...run.events].reverse().find((event) =>
    (event.type === 'host.command-intent' || event.type === 'cave.logical-tick-intent') &&
    typeof event.data?.requestId === 'string' && !accepted.has(String(event.data.requestId)))
  if (controlIntent) {
    const data = controlIntent.data!
    const operation = data.operation === 'start' || data.operation === 'advance' || data.operation === 'tick' ? data.operation : undefined
    if (!operation || typeof data.requestId !== 'string') throw new Error('Stored host command intent is incomplete')
    await controlSession(run.sessionId!, operation, typeof data.expectedToken === 'string' ? data.expectedToken : undefined, data.requestId, signal)
    if (run.abortEpoch !== epoch || run.status !== 'running') return true
    await appendEvent(run, { audience: 'observer', type: 'host.command-accepted', data: { requestId: data.requestId, operation, recovered: true } })
    return true
  }
  return false
}

async function finishRun(run: RunRecord, service: ServiceView) {
  if (run.events.some((event) => event.type === 'run.finished')) return
  try { await getViews(run) } catch { /* Preserve final results even if player views are no longer available. */ }
  run.status = 'finished'
  const teams = service.state?.teams as Array<{ id: string; name: string; balance: string; stars: number; tieOrder: number }> | undefined
  if (teams) {
    const formatCents = (value: string) => { const cents = BigInt(value); return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}` }
    const standings = [...teams].sort((a, b) => BigInt(b.balance) > BigInt(a.balance) ? 1 : BigInt(b.balance) < BigInt(a.balance) ? -1 : a.tieOrder - b.tieOrder)
      .map((team, index) => ({ teamId: team.id, name: team.name, rank: index + 1, balance: formatCents(team.balance), stars: team.stars }))
    if (!run.events.some((event) => event.type === 'final.standings')) await appendEvent(run, { audience: 'observer', type: 'final.standings', data: { standings } })
  }
  await appendEvent(run, { audience: 'observer', type: 'run.finished' })
}

async function stepRun(run: RunRecord, epoch: number, signal: AbortSignal) {
  if (run.abortEpoch !== epoch) return
  if (!run.sessionId || !run.agents.length) await ensureSession(run)
  if (run.status !== 'running' || run.abortEpoch !== epoch) return
  const sessionId = run.sessionId
  if (!sessionId) throw new Error('Simulation session setup did not return a session')
  if (await recoverPendingIntent(run, epoch, signal)) return
  const pendingBarrier = [...run.events].reverse().find((event) => event.type === 'barrier.proposed' && !run.events.some((later) => later.sequence > event.sequence && (later.type === 'barrier.completed' || later.type === 'barrier.recollected') && later.data?.barrierId === event.data?.barrierId))
  if (pendingBarrier) {
    const outcome = await dispatchBarrier(run, pendingBarrier, epoch, signal)
    if (outcome !== 'done') return
    if (pendingBarrier.data?.kind === 'operations') await appendEvent(run, { audience: 'observer', type: 'operation.batch.completed', game: pendingBarrier.game, round: pendingBarrier.round, data: { window: pendingBarrier.data.window, barrierId: pendingBarrier.data.barrierId } })
    return
  }
  for (const event of run.events.filter((item) => item.type === 'barrier.proposed' && item.data?.kind === 'operations')) {
    const barrierId = event.data?.barrierId
    const completed = run.events.some((item) => item.type === 'barrier.completed' && item.data?.barrierId === barrierId)
    const alreadyRecorded = run.events.some((item) => item.type === 'operation.batch.completed' && item.data?.barrierId === barrierId)
    const recollected = run.events.some((item) => item.type === 'barrier.recollected' && item.data?.barrierId === barrierId)
    if (completed && !alreadyRecorded && !recollected) {
      await appendEvent(run, { audience: 'observer', type: 'operation.batch.completed', game: event.game, round: event.round, data: { window: event.data?.window, barrierId } })
      return
    }
  }
  let service = await getServiceView(sessionId, signal)
  if (run.status !== 'running' || run.abortEpoch !== epoch) return
  if (service.status === 'finished' || service.state?.status === 'finished') {
    await finishRun(run, service); return
  }
  const loc = currentLocation(service)
  const unreviewedBeat = [...run.events].reverse().find((event) => event.type === 'discussion.beat' && event.game === loc.game && event.round === loc.round && !run.events.some((review) => review.type === 'host.discussion-decision' && review.data?.beat === event.data?.beat && review.game === event.game && review.round === event.round))
  if (unreviewedBeat && loc.phase !== 'ready' && loc.phase !== 'complete') {
    await hostReview(run, service, Number(unreviewedBeat.data?.beat || 0), unreviewedBeat.data?.window as number | undefined, signal)
    return
  }
  if (loc.phase !== 'ready' && !run.events.some((event) => event.type === 'host.announcement' && event.game === loc.game && event.round === loc.round)) {
    await hostAnnouncement(run, service, signal)
    return
  }
  if (loc.phase === 'ready') {
    const first = run.events.filter((e) => e.type === 'round.started').length === 0
    const requestId = randomUUID()
    await appendEvent(run, { audience: 'observer', type: 'host.command-intent', game: loc.game, round: loc.round, data: { operation: first ? 'start' : 'start', requestId } })
    if (run.abortEpoch !== epoch || run.status !== 'running') return
    await controlSession(sessionId, 'start', undefined, requestId, signal)
    await appendEvent(run, { audience: 'observer', type: 'host.command-accepted', data: { requestId, operation: 'start' } })
    await appendEvent(run, { audience: 'observer', type: 'round.started', game: loc.game, round: loc.round })
    service = await getServiceView(sessionId, signal)
    await hostAnnouncement(run, service, signal)
    return
  }
  if (loc.phase === 'complete') {
    if (!run.events.some((event) => event.type === 'round.complete' && event.game === loc.game && event.round === loc.round)) {
      await appendEvent(run, { audience: 'public', type: 'round.complete', game: loc.game, round: loc.round, text: `${loc.game} round ${loc.round} is complete.` })
    }
    const requestId = randomUUID()
    await appendEvent(run, { audience: 'observer', type: 'host.command-intent', game: loc.game, round: loc.round, data: { operation: 'advance', requestId } })
    if (run.abortEpoch !== epoch || run.status !== 'running') return
    service = await controlSession(sessionId, 'advance', undefined, requestId, signal)
    await appendEvent(run, { audience: 'observer', type: 'host.command-accepted', data: { requestId, operation: 'advance' } })
    if (service.status === 'finished' || service.state?.status === 'finished') {
      await finishRun(run, service); return
    }
    await hostAnnouncement(run, service, signal)
    return
  }
  const views = await getViews(run, signal)
  if (await acknowledgeReveals(run, views, epoch, signal)) return
  const window = operationWindow(service)
  const operationDone = run.events.some((event) => event.type === 'operation.batch.completed' && event.game === loc.game && event.round === loc.round && event.data?.window === window)
  if (!operationDone) {
    const result = await operationBarrier(run, service, views, epoch, signal)
    if (result !== 'done') return
    return
  }
  const caveWindow = service.state?.current?.game === 'cave' ? service.state.current.tick : undefined
  const inCave = service.state?.current?.game === 'cave'
  const windowEvents = run.events.filter((e) => e.type === 'discussion.beat' && e.game === loc.game && e.round === loc.round && (!inCave || e.data?.window === caveWindow))
  const discussionCount = windowEvents.length
  const minBeats = inCave ? run.options.caveDiscussionBeats : run.options.minDiscussionBeats
  const maxBeats = inCave ? run.options.caveDiscussionBeats : run.options.maxDiscussionBeats
  const lastReview = run.events.findLast((e) => e.type === 'host.discussion-decision' && e.game === loc.game && e.round === loc.round && (!inCave || e.data?.window === caveWindow))
  if (discussionCount < minBeats || (discussionCount < maxBeats && lastReview?.data?.continueDiscussion === true)) {
    await discussionBeat(run, service, views, epoch, signal)
    return
  }
  const decision = await decisionBarrier(run, service, views, epoch, signal)
  if (run.status !== 'running' || run.abortEpoch !== epoch) return
  if (decision === 'recollect' || decision === 'cancelled') return
  service = await getServiceView(sessionId, signal)
  if (isRoundComplete(service)) return
  if (service.state?.current?.game === 'cave' && service.state?.current?.phase === 'cave' && service.state?.current?.nextTickAt != null) {
    const requestId = randomUUID()
    const caveToken = service.state.current.token
    await appendEvent(run, { audience: 'observer', type: 'cave.logical-tick-intent', game: 'cave', round: service.state.round, data: { requestId, operation: 'tick', expectedToken: String(caveToken), window: service.state.current.tick, revision: service.revision } })
    if (run.abortEpoch !== epoch || run.status !== 'running') return
    service = await controlSession(sessionId, 'tick', String(caveToken), requestId, signal)
    await appendEvent(run, { audience: 'observer', type: 'host.command-accepted', data: { requestId, operation: 'tick' } })
    await appendEvent(run, { audience: 'public', type: 'cave.window', game: 'cave', round: service.state.round, logicalTime: service.logicalTime, text: 'The cave clock advances to the next decision window.' })
  }
}

export async function resumeRun(run: RunRecord) {
  if (run.status !== 'paused') throw new Error('Only paused runs can resume')
  run.error = undefined
  if (!run.sessionId || !run.agents.length) await ensureSession(run)
  if (run.status !== 'paused') throw new Error('Run changed state while its session was being restored')
  run.status = 'running'; await saveRun(run); void supervise(run.id)
}
export async function pauseRun(run: RunRecord, stop = false) {
  run.abortEpoch++
  controllers.get(run.id)?.abort(new Error(stop ? 'Run stopped' : 'Run paused'))
  run.status = stop ? 'stopped' : 'paused'
  await appendEvent(run, { audience: 'observer', type: stop ? 'run.stopped' : 'run.paused', data: { epoch: run.abortEpoch } })
}
export async function stepPausedRun(run: RunRecord) {
  if (run.status !== 'paused') throw new Error('Run must be paused to step')
  const until = Date.now() + 5000
  while (running.has(run.id) && Date.now() < until) await wait(10)
  if (running.has(run.id)) throw new Error('Previous turn is still shutting down; retry step shortly')
  const budget = runBudgetLimitReached(run)
  if (budget) {
    await appendEvent(run, { audience: 'observer', type: 'run.budget-paused', data: { stepCount: run.stepCount, tokensUsed: run.tokensUsed, budget, manualStep: true } })
    return
  }
  if (!run.sessionId || !run.agents.length) await ensureSession(run)
  if (run.status !== 'paused') throw new Error('Run changed state while its session was being restored')
  run.abortEpoch++
  const epoch = run.abortEpoch
  run.status = 'running'; await saveRun(run)
  const controller = new AbortController(); controllers.set(run.id, controller)
  const started = Date.now()
  try { await stepRun(run, epoch, controller.signal) }
  catch (error) { if (run.status === 'running') run.status = 'paused'; throw error }
  finally {
    run.elapsedMs += Date.now() - started
    controllers.delete(run.id)
    if (run.status === 'running') run.status = 'paused'
    await saveRun(run)
  }
}
export async function kickRun(id: string) {
  const run = getRun(id)
  if (run?.status === 'created') { try { await beginRun(run) } catch (error) { run.status = 'failed'; run.error = error instanceof Error ? error.message : String(error); await saveRun(run) } }
  else if (run?.status === 'running') void supervise(id)
}
