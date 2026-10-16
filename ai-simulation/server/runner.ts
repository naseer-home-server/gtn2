import { randomUUID } from 'node:crypto'
import { gameConfigSchema, gameActionSchema } from 'backend/engine'
import { appendEvent, getRun, saveRun } from './store.js'
import { createSession, getPlayerView, getServiceView, controlSession, playerAction, createDirectChat, sendPrivateChat, type ServiceView } from './game-client.js'
import { hostLine, hostDiscussionSwaps, playerTurn, scriptedTurn, type AgentResponse, type ModelTurnHooks, type PlayerTurnPhase } from './provider.js'
import type { AgentRecord, RunRecord, RunEvent } from './types.js'
import type { PlayerGameView } from 'backend/game'
import { gameRuleCard, globalRuleCard, gameTheoryBriefing } from './rules.js'
import { recordRequest, recordUsage } from './usage.js'
import { providerConfig } from './config.js'
import { isFinancialAction } from './validation.js'
import { applyDiscussionSwaps, assertDiscussionRoster, type DiscussionSwap } from './discussion-order.js'

const running = new Set<string>()
const controllers = new Map<string, AbortController>()
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
export function hasBarrierPublicMessage(run: Pick<RunRecord, 'events'>, barrierId: string, agentId: string) {
  return run.events.some((event) => event.audience === 'public' && event.type === 'player.message' && event.data?.barrierId === barrierId && event.data?.speakerId === agentId)
}
export function hasPrivateChatObservation(run: Pick<RunRecord, 'events'>, audience: string, clientMessageId: string) {
  return run.events.some((event) => event.audience === audience && event.type === 'chat.private-message' && event.data?.clientMessageId === clientMessageId)
}
export function runBudgetLimitReached(run: Pick<RunRecord, 'elapsedMs' | 'stepCount' | 'options'>) {
  if (run.elapsedMs >= run.options.maxWallTimeMs) return 'wall-time'
  if (run.stepCount >= run.options.maxSteps) return 'steps'
  return undefined
}
async function mapLimit<T, U>(items: T[], limit: number, fn: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const result = new Array<U>(items.length)
  let cursor = 0
  let failure: unknown
  // Settle every in-flight call before pausing; no orphan model calls can outlive this batch.
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, async () => {
    while (cursor < items.length && failure === undefined) {
      const index = cursor++
      try { result[index] = await fn(items[index]!, index) }
      catch (error) { failure ??= error }
    }
  }))
  if (failure !== undefined) throw failure
  return result
}
function modelTurnHooks(run: RunRecord, actor: { id: string; name: string }, game?: RunEvent['game'], round?: number, signal?: AbortSignal, turnPhase?: PlayerTurnPhase | 'discussion-order'): ModelTurnHooks {
  const stats = run.modelUsage?.[actor.id]
  return {
    actorId: actor.id,
    turnPhase: turnPhase === 'discussion-order' ? undefined : turnPhase,
    tokenCalibration: { promptTokens: stats?.calibrationPromptTokens, requestBytes: stats?.calibrationRequestBytes },
    async onRequest(request, attempt) {
      recordRequest(run, actor.id, request)
      await appendEvent(run, { audience: 'observer', type: 'model.request', game, round,
        data: { agentId: actor.id, turnPhase, attempt, ...request } })
    },
    async onContextError(error) {
      const details = { agentId: actor.id, speakerName: actor.name, ...error.details }
      if (run.status === 'running' || (run.status === 'paused' && !run.errorCode)) {
        run.status = 'paused'; run.errorCode = error.code; run.error = actor.name + ': ' + error.message; run.errorDetails = details
      }
      await appendEvent(run, { audience: 'observer', type: 'model.context-limit', game, round,
        text: actor.name + ': ' + error.message, data: { code: error.code, ...details } })
    },
    async onRequestError(error) {
      const details = { agentId: actor.id, speakerName: actor.name, ...error.details }
      if (run.status === 'running') {
        run.status = 'paused'; run.errorCode = error.code; run.error = actor.name + ': ' + error.message; run.errorDetails = details
      }
      await appendEvent(run, { audience: 'observer', type: 'model.request-error', game, round,
        text: actor.name + ': ' + error.message, data: { code: error.code, ...details } })
    },
    async onOutputError(error) {
      const details = { agentId: actor.id, speakerName: actor.name, turnPhase, ...error.details }
      if (run.status === 'running') {
        run.status = 'paused'; run.errorCode = error.code; run.error = actor.name + ': ' + error.message; run.errorDetails = details
      }
      await appendEvent(run, { audience: 'observer', type: 'model.output-limit', game, round,
        text: actor.name + ': ' + error.message, data: { code: error.code, ...details } })
    },
    async beforeAttempt() {
      signal?.throwIfAborted()
      if (run.status !== 'running') throw new Error('Run is no longer running')
    },
    async onUsage(tokens, attempt, usage) {
      recordUsage(run, actor.id, usage)
      run.tokensUsed += tokens
      await appendEvent(run, { audience: 'observer', type: actor.id === 'host' ? 'model.host-usage' : 'model.player-usage',
        game, round, data: { agentId: actor.id, tokens, attempt, ...usage } })
    },
    async onValidationError(failure) {
      await appendEvent(run, { audience: 'observer', type: 'model.validation-error', game, round,
        text: actor.name + ' tool attempt ' + failure.attempt + '/' + failure.maxAttempts + (turnPhase ? ' (' + turnPhase + ')' : '') + ' rejected: ' + failure.issues.join('; '),
        data: { agentId: actor.id, speakerName: actor.name, turnPhase, ...failure } })
    },
  }
}
async function modelPlayerTurn(run: RunRecord, agent: AgentRecord, view: PlayerGameView, decision: boolean, signal: AbortSignal, turnPhase: PlayerTurnPhase = decision ? 'decision' : 'discussion') {
  try {
    return await playerTurn(view, run.events, run.options, run.config, decision, run.events.filter(event => event.audience === agent.id),
      signal, modelTurnHooks(run, agent, view.game || undefined, view.round || undefined, signal, turnPhase))
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(agent.name + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}
const orderFor = (count: number, seed: number, step: number) => {
  const offset = (Math.imul(seed ^ step, 0x45d9f3b) >>> 0) % count
  return Array.from({ length: count }, (_, i) => (i + offset) % count)
}
type DiscussionStage = 'pre-round' | 'post-round' | 'cave-discussion'
function discussionOrder(count: number, seed: number) {
  const order = Array.from({ length: count }, (_, index) => index)
  let state = seed >>> 0 || 0x9e3779b9
  for (let i = order.length - 1; i > 0; i--) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0
    const j = Math.floor((state / 0x1_0000_0000) * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
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

async function observePublicState(run: RunRecord, service: ServiceView) {
  if (!service.state) return
  const state = { status: service.status, game: service.state.current?.game, round: service.state.round,
    phase: service.state.current?.phase,
    teams: service.state.teams?.map((team: { id: string; name: string; stars: number }) => ({ id: team.id, name: team.name, stars: team.stars })),
    pot: { amountCents: service.state.pot?.amount, targetCents: service.state.pot?.target },
    publicReveal: service.state.reveal ? { id: service.state.reveal.id, rankings: service.state.reveal.rankings } : null,
    bombRecipient: service.state.current?.game === 'bomb' ? service.state.current.recipient : null }
  const previous = run.events.findLast(event => event.type === 'game.public-state')
  if (JSON.stringify(previous?.data?.state) !== JSON.stringify(state)) {
    await appendEvent(run, { audience: 'public', type: 'game.public-state', game: state.game, round: state.round,
      text: 'Public game state updated.', data: { state } })
  }
  const priorAudit = run.events.findLast(event => event.type === 'game.audit-snapshot')
  const eventCursor = Number(priorAudit?.data?.sessionEventSequence ?? 0)
  const newEvents = (service.events || []).filter((event: any) => Number(event.sequence) > eventCursor)
  const revision = Number(service.state.revision ?? service.revision)
  if (Number(priorAudit?.data?.revision) !== revision || newEvents.length > 0) {
    await appendEvent(run, { audience: 'observer', type: 'game.audit-snapshot', game: service.state.current?.game,
      round: service.state.round, data: {
        revision,
        sessionEventSequence: Math.max(eventCursor, ...newEvents.map((event: any) => Number(event.sequence) || 0)),
        teams: service.state.teams?.map((team: any) => ({ id: team.id, name: team.name, balance: team.balance, stars: team.stars })),
        gameEvents: newEvents.map((event: any) => ({ sequence: event.sequence, type: event.type, actorId: event.actorId,
          data: event.data, createdAt: event.createdAt })),
      } })
  }
}

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
  const rulesCard = (location.game === 'bomb' ? undefined : previousCard?.text) || [includeGlobal ? globalRuleCard() : '', hostRulesCard(run, service, location)].filter(Boolean).join('\n\n')
  if (!previousCard) await appendEvent(run, { audience: 'public', type: 'rules.card', text: rulesCard, game: location.game, round: location.round })
  let announcement = text || `${location.game || 'Game'} · round ${location.round || 1}. The next phase is ready.`
  if (run.options.mode === 'openai') {
    const gameRules = location.game === 'bonus' ? { bonus: run.config.bonus }
      : location.game === 'high-low' ? { highLow: run.config.highLow }
      : location.game === 'cave' ? { cave: run.config.cave }
      : location.game === 'circle' ? { circle: run.config.circle }
      : location.game === 'bomb' ? { bomb: run.config.bomb } : {}
    const result = await hostLine({ rules: gameRules, rulesCard: hostRulesCard(run, service, location), game: location.game, round: location.round, phase: location.phase, publicProgress: { completedRounds: run.events.filter((e) => e.type === 'round.complete').length } }, run.options, signal, modelTurnHooks(run, { id: 'host', name: 'Host' }, location.game, location.round, signal), run.events)
    if (signal.aborted) return
    announcement = result.text
    if (signal.aborted) return
  }
  if (signal.aborted) return
  await appendEvent(run, { audience: 'public', type: 'host.announcement', text: announcement, game: location.game, round: location.round })
}

function discussionEvents(run: RunRecord, service: ServiceView, stage: DiscussionStage, window?: number) {
  const location = currentLocation(service)
  return run.events.filter(event => event.game === location.game && event.round === location.round
    && event.data?.discussionStage === stage && event.data?.window === window)
}
function discussionNextStep(stage: DiscussionStage) {
  return stage === 'pre-round' ? 'Settle agreed payments in the financial-action window, then the host will start the round for game decisions.'
    : stage === 'post-round' ? 'A final financial-action window lets teams settle promises before moving to the next round.'
      : 'Financial actions and simultaneous cave decisions follow; the clock stays frozen until decisions are collected.'
}

async function discussionBeat(run: RunRecord, service: ServiceView, stage: DiscussionStage, window: number | undefined, epoch: number, signal: AbortSignal) {
  const location = currentLocation(service)
  const phaseEvents = discussionEvents(run, service, stage, window)
  let sweep = phaseEvents.findLast(event => event.type === 'discussion.sweep-started'
    && !phaseEvents.some(done => done.type === 'discussion.beat' && done.data?.sweepId === event.id))
  if (!sweep) {
    if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return
    let proposal = phaseEvents.findLast(event => event.type === 'discussion.order-proposed'
      && !phaseEvents.some(started => started.type === 'discussion.sweep-started' && started.data?.orderProposalId === event.id))
    if (!proposal) {
      const beat = run.stepCount + 1
      proposal = await appendEvent(run, { audience: 'observer', type: 'discussion.order-proposed', game: location.game, round: location.round,
        data: { discussionStage: stage, window, beat,
          initialOrder: discussionOrder(run.agents.length, run.options.seed ^ Math.imul(beat, 997)).map(index => run.agents[index]!.id) } })
    }
    const initialOrder = proposal.data?.initialOrder
    assertDiscussionRoster(initialOrder, run.agents.map(agent => agent.id))
    let reviewed = run.events.find(event => event.type === 'discussion.order-reviewed' && event.data?.proposalId === proposal!.id)
    if (!reviewed) {
      const teams = initialOrder.map(id => {
        const agent = run.agents.find(team => team.id === id)
        if (!agent) throw new Error('Discussion order references an unknown team')
        return { id: agent.id, name: agent.name }
      })
      const result = run.options.mode === 'scripted' ? { swaps: [] as DiscussionSwap[] }
        : await hostDiscussionSwaps(teams, { game: location.game, round: location.round, discussionStage: stage,
          window, sweep: phaseEvents.filter(event => event.type === 'discussion.beat').length + 1 }, run.options, signal,
        modelTurnHooks(run, { id: 'host', name: 'Host' }, location.game, location.round, signal, 'discussion-order'), run.events)
      if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return
      const schedulerOrder = applyDiscussionSwaps(initialOrder, result.swaps)
      reviewed = await appendEvent(run, { audience: 'observer', type: 'discussion.order-reviewed', game: location.game, round: location.round,
        text: 'Speaking order: ' + schedulerOrder.map(id => run.agents.find(agent => agent.id === id)!.name).join(' → ')
          + (result.swaps.length ? '. Host applied ' + result.swaps.length + ' swap(s).' : '. Random order retained.'),
        data: { discussionStage: stage, window, speakerName: 'Host', source: run.options.mode === 'scripted' ? 'scripted' : 'host',
          proposalId: proposal.id, initialOrder, swaps: result.swaps, schedulerOrder } })
    }
    if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return
    sweep = await appendEvent(run, { audience: 'observer', type: 'discussion.sweep-started', game: location.game, round: location.round,
      data: { discussionStage: stage, window, beat: proposal.data?.beat, orderProposalId: proposal.id, orderReviewId: reviewed.id,
        schedulerOrder: applyDiscussionSwaps(initialOrder, reviewed.data!.swaps as DiscussionSwap[]) } })
  }
  const sweepId = sweep.id
  const order = sweep.data?.schedulerOrder
  assertDiscussionRoster(order, run.agents.map(agent => agent.id))
  for (const agentId of order) {
    if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return
    const agent = run.agents.find(item => item.id === agentId)
    if (!agent) throw new Error('Discussion order references an unknown team')
    const previous = run.events.findLast(event => event.type === 'barrier.proposed' && event.data?.sweepId === sweepId && event.data?.speakerId === agentId)
    if (previous && run.events.some(event => event.type === 'barrier.completed' && event.data?.barrierId === previous.data?.barrierId)) continue
    const recollected = previous && run.events.some(event => event.type === 'barrier.recollected'
      && event.sequence > previous.sequence && event.data?.barrierId === previous.data?.barrierId)
    let barrier = recollected ? undefined : previous
    if (!barrier) {
      // A previous speaker may have paid this team or filled a reveal pot.
      // Refresh every private view and acknowledge reveals before continuing the saved order.
      const freshViews = await getViews(run, signal)
      if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return
      if (freshViews.some(view => view.reveal?.scope === 'public')) {
        // Publish the public snapshot before automatic acknowledgments hide it.
        await observePublicState(run, await getServiceView(run.sessionId!, signal))
      }
      if (await acknowledgeReveals(run, freshViews, epoch, signal)) return
      const fresh = freshViews[run.agents.indexOf(agent)]!
      const view = { ...fresh, allowedActions: fresh.allowedActions.filter(isFinancialAction) }
      // Deliver speech and execute optional financial actions before calling the next speaker.
      const answer = run.options.mode === 'scripted' ? scriptedTurn(view, run.options.seed ^ run.stepCount)
        : await modelPlayerTurn(run, agent, view, false, signal, stage)
      if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return
      if (answer.action && !isFinancialAction(answer.action.type)) throw new Error(agent.name + ': game actions are not allowed during discussion')
      // Keep the speaker's delivered chat stable if an uncommitted financial action needs a fresh decision.
      const earlier = (previous?.data?.proposals as Array<{ message?: string; privateMessage?: AgentResponse['privateMessage']; privateMessageId?: string }> | undefined)?.[0]
      const message = earlier?.message ?? answer.message?.slice(0, 1000)
      const privateMessage = earlier?.privateMessage ?? answer.privateMessage
      barrier = await appendEvent(run, { audience: 'observer', type: 'barrier.proposed', game: location.game, round: location.round,
        data: { barrierId: previous?.data?.barrierId || randomUUID(), kind: 'discussion-turn', sweepId, speakerId: agent.id, discussionStage: stage, window,
          proposals: [{ agentId: agent.id, token: view.token, action: answer.action,
            actionRequestId: answer.action ? randomUUID() : undefined,
            message, privateMessage,
            privateMessageId: earlier?.privateMessageId ?? (privateMessage ? randomUUID() : undefined) }] } })
    }
    if (await dispatchBarrier(run, barrier, epoch, signal) !== 'done') return
  }
  if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return
  run.stepCount++
  await appendEvent(run, { audience: 'observer', type: 'discussion.beat', game: location.game, round: location.round,
    data: { discussionStage: stage, window, sweepId, beat: sweep.data?.beat, schedulerOrder: order } })
}

async function hostReview(run: RunRecord, service: ServiceView, sweep: RunEvent, signal: AbortSignal) {
  const location = currentLocation(service)
  const stage = sweep.data!.discussionStage as DiscussionStage
  const window = sweep.data?.window as number | undefined
  const sweepId = String(sweep.data?.sweepId)
  const phaseEvents = discussionEvents(run, service, stage, window)
  const count = phaseEvents.filter(event => event.type === 'discussion.beat').length
  const min = stage === 'cave-discussion' ? run.options.caveDiscussionBeats : run.options.minDiscussionBeats
  const max = stage === 'cave-discussion' ? run.options.caveDiscussionBeats : run.options.maxDiscussionBeats
  const prior = phaseEvents.find(event => event.type === 'host.review' && event.data?.sweepId === sweepId)
  let review = { text: discussionNextStep(stage), continueDiscussion: false, tokens: 0 }
  if (prior) review = { text: prior.text || '', continueDiscussion: prior.data?.continueDiscussion === true, tokens: 0 }
  else if (run.options.mode === 'openai') {
    const barriers = run.events.filter(event => event.type === 'barrier.proposed' && event.data?.sweepId === sweepId)
    const currentSweep = ((sweep.data?.schedulerOrder || []) as string[]).map(agentId => {
      const barrier = barriers.find(event => event.data?.speakerId === agentId)
      const reply = barrier ? run.events.find(event => event.audience === 'public' && event.type === 'player.message' && event.data?.barrierId === barrier.data?.barrierId) : undefined
      return { speaker: run.agents.find(agent => agent.id === agentId)?.name, message: reply?.text ?? null }
    })
    review = await hostLine({ reviewRequired: true, rulesCard: hostRulesCard(run, service, location),
      game: location.game, round: location.round, phase: location.phase, discussionStage: stage,
      currentSweep, completedSweeps: count, minimumSweeps: min, maximumSweeps: max, nextStep: discussionNextStep(stage),
    }, run.options, signal, modelTurnHooks(run, { id: 'host', name: 'Host' }, location.game, location.round, signal), run.events)
  }
  if (signal.aborted || run.status !== 'running') return
  const continueDiscussion = count < min || count < max && review.continueDiscussion
  if (!prior) {
    const text = continueDiscussion && !review.continueDiscussion ? 'We have another scheduled discussion sweep. Respond to the proposals already on the table.'
      : !continueDiscussion && review.continueDiscussion ? 'The discussion limit has been reached. ' + discussionNextStep(stage) : review.text
    await appendEvent(run, { audience: 'public', type: 'host.review', game: location.game, round: location.round, text,
      data: { discussionStage: stage, window, sweepId, continueDiscussion } })
  }
  await appendEvent(run, { audience: 'observer', type: 'host.discussion-decision', game: location.game, round: location.round,
    data: { discussionStage: stage, window, sweepId, beat: sweep.data?.beat, continueDiscussion } })
}

async function discussionPhase(run: RunRecord, service: ServiceView, stage: DiscussionStage, window: number | undefined, epoch: number, signal: AbortSignal) {
  if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return false
  const max = stage === 'cave-discussion' ? run.options.caveDiscussionBeats : run.options.maxDiscussionBeats
  // Disabled discussion has no speakers, host reviews, or public open/close notices.
  if (max === 0) return true
  const phaseEvents = discussionEvents(run, service, stage, window)
  if (phaseEvents.some(event => event.type === 'discussion.closed')) return true
  const location = currentLocation(service)
  if (!phaseEvents.some(event => event.type === 'discussion.opened')) {
    const text = stage === 'pre-round' ? 'Between-round discussion: review your own previous results and agree on a plan using the upcoming round rules. Transfers and reveal contributions are available during each turn; game choices wait for the host to start the round.'
      : stage === 'post-round' ? 'Post-round discussion: every team has received its own private round feedback. Review promises, negotiate, and make transfers or reveal contributions during your turn.'
        : 'Cave window discussion: take turns and respond to earlier speakers. The clock is frozen; transfers and reveal contributions are available, while cave decisions follow separately.'
    await appendEvent(run, { audience: 'public', type: 'discussion.opened', game: location.game, round: location.round,
      text, data: { discussionStage: stage, window, speakerName: 'Host' } })
  }
  const sweeps = phaseEvents.filter(event => event.type === 'discussion.beat')
  const unreviewed = sweeps.find(event => !phaseEvents.some(review => review.type === 'host.discussion-decision' && review.data?.sweepId === event.data?.sweepId))
  if (unreviewed) { await hostReview(run, service, unreviewed, signal); return false }
  const min = stage === 'cave-discussion' ? run.options.caveDiscussionBeats : run.options.minDiscussionBeats
  const lastReview = phaseEvents.findLast(event => event.type === 'host.discussion-decision')
  const pendingSweep = phaseEvents.some(event => event.type === 'discussion.sweep-started' && !sweeps.some(done => done.data?.sweepId === event.id))
  if (pendingSweep || sweeps.length < min || sweeps.length < max && lastReview?.data?.continueDiscussion === true) {
    await discussionBeat(run, service, stage, window, epoch, signal)
    return false
  }
  if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return false
  await appendEvent(run, { audience: 'public', type: 'discussion.closed', game: location.game, round: location.round,
    text: discussionNextStep(stage), data: { discussionStage: stage, window, speakerName: 'Host' } })
  return true
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
async function roundFeedback(run: RunRecord, service: ServiceView, views: PlayerGameView[]) {
  const location = currentLocation(service)
  const feedback = views.map((view, index) => {
    const earnings = view.earnings.find(item => item.game === location.game && item.round === location.round)
    if (!earnings || !view.team) throw new Error(run.agents[index]!.name + ': private round feedback is not ready; the next discussion has not started')
    return { agent: run.agents[index]!, view, earnings }
  })
  for (const { agent, view, earnings } of feedback) {
    if (run.events.some(event => event.type === 'round.feedback' && event.audience === agent.id && event.game === location.game && event.round === location.round)) continue
    await appendEvent(run, { audience: agent.id, type: 'round.feedback', game: location.game, round: location.round,
      text: `Your round payout is ${earnings.amount}. Your current balance is ${view.team!.balance}. This is your private result, not evidence of other teams' choices.`,
      data: { earnings, balance: view.team!.balance, stars: view.team!.stars,
        received: view.roundState?.received, returned: view.roundState?.returned,
        moneyTransfers: view.moneyTransfers, bombRecipient: view.roundState?.bombRecipient,
        bombDirection: view.roundState?.bombDirection } })
  }
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
    const view = { ...views[i]!, allowedActions: views[i]!.allowedActions.filter(type => !['money.transfer', 'pot.contribute', 'reveal.acknowledge'].includes(type)) }
    if (!view.allowedActions.length) return { agent, view, answer: { tokens: 0 } as Awaited<ReturnType<typeof playerTurn>> }
    const answer = run.options.mode === 'scripted'
      ? scriptedTurn(view, run.options.seed ^ (run.stepCount * 997) ^ i)
      : await modelPlayerTurn(run, agent, view, true, signal)
    return { agent, view, answer }
  })
  if (run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled' as const
  run.stepCount++
  if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled' as const
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

async function operationBarrier(run: RunRecord, service: ServiceView, views: PlayerGameView[], epoch: number, signal: AbortSignal, window = operationWindow(service)) {
  const location = currentLocation(service)
  // A public reveal can invalidate the rest of a batch. Keep accepted payments final when recollecting it.
  const accepted = new Set(run.events.filter(event => event.type === 'command.accepted').map(event => event.data?.requestId))
  const committed = new Set(run.events.filter(event => event.type === 'barrier.proposed' && event.data?.kind === 'operations' && event.data?.window === window)
    .flatMap(event => (event.data?.proposals || []) as Array<{ agentId: string; actionRequestId?: string }>)
    .filter(proposal => proposal.actionRequestId && accepted.has(proposal.actionRequestId)).map(proposal => proposal.agentId))
  const proposals = await mapLimit(run.agents, providerConfig.concurrency, async (agent, i) => {
    const view = views[i]!
    const sideActions = view.allowedActions.filter(isFinancialAction)
    if (!sideActions.length || committed.has(agent.id)) return { agent, view, answer: { tokens: 0 } as { tokens: number; action?: any; message?: string; privateMessage?: { teamId: string; text: string } } }
    const limitedView = { ...view, allowedActions: sideActions }
    const answer = run.options.mode === 'scripted' ? scriptedTurn(limitedView, run.options.seed ^ (run.stepCount * 31) ^ i)
      : await modelPlayerTurn(run, agent, limitedView, true, signal, 'operations')
    return { agent, view: limitedView, answer }
  })
  if (run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled' as const
  run.stepCount++
  if (signal.aborted || run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled' as const
  const order = orderFor(proposals.length, run.options.seed ^ 0x1b7, run.stepCount)
  const barrierId = randomUUID()
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
  // Only scheduled discussion turns may communicate, including when recovering old batches.
  const messagingAllowed = data.kind === 'discussion-turn' || data.kind === 'discussion'
  for (const proposal of proposals) {
    if (run.status !== 'running' || run.abortEpoch !== epoch) return 'cancelled'
    const agent = run.agents.find((item) => item.id === proposal.agentId)
    if (!agent) throw new Error('Stored barrier references an unknown agent')
    const publicMessageExists = hasBarrierPublicMessage(run, barrierId, agent.id)
    if (messagingAllowed && proposal.message && !publicMessageExists) {
      await appendEvent(run, { audience: 'public', type: 'player.message', text: proposal.message, game: barrier.game, round: barrier.round, data: { speakerId: agent.id, speakerName: agent.name, barrierId, discussionStage: data.discussionStage } })
    }
    if (messagingAllowed && proposal.message && !run.events.some((event) => event.type === 'barrier.message-sent' && event.data?.barrierId === barrierId && event.data?.agentId === agent.id)) {
      await appendEvent(run, { audience: 'observer', type: 'barrier.message-sent', data: { barrierId, agentId: agent.id } })
    }
    if (messagingAllowed && proposal.privateMessage && !run.events.some((event) => event.type === 'chat.send-accepted' && event.data?.requestId === proposal.privateMessageId)) {
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
    const operation = data.operation === 'start' || data.operation === 'advance' || data.operation === 'prepare' || data.operation === 'tick' ? data.operation : undefined
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
  await observePublicState(run, service)
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
  await observePublicState(run, service)
  if (service.status === 'finished' || service.state?.status === 'finished') {
    await finishRun(run, service); return
  }
  const loc = currentLocation(service)
  if (loc.game === 'cave' && run.events.some(event => event.type === 'rules.card' && event.game === 'cave' && event.round === loc.round && !event.text?.includes('final decision window')) &&
    !run.events.some(event => event.type === 'rules.correction' && event.game === 'cave' && event.round === loc.round && event.data?.version === 'cave-tick-limit-v1')) {
    await appendEvent(run, { audience: 'public', type: 'rules.correction', game: 'cave', round: loc.round,
      text: 'Cave tick limit update: ' + hostRulesCard(run, service, loc), data: { version: 'cave-tick-limit-v1' } })
  }
  if (!run.events.some(event => event.type === 'host.briefing' && event.data?.version === 'discussion-finances-v3')) {
    await appendEvent(run, { audience: 'public', type: 'host.briefing', game: loc.game, round: loc.round,
      text: gameTheoryBriefing(), data: { version: 'discussion-finances-v3', speakerName: 'Host' } })
  }
  if (loc.game === 'bomb' && run.events.some(event => event.type === 'rules.card' && event.game === 'bomb' && event.round === loc.round && event.text?.includes('each up/down pile')) &&
    !run.events.some(event => event.type === 'rules.correction' && event.game === 'bomb' && event.round === loc.round && event.data?.version === 'bomb-pile-totals-v1')) {
    await appendEvent(run, { audience: 'public', type: 'rules.correction', game: 'bomb', round: loc.round,
      text: 'Correction: up and down share ONE direction pile; recipient chits form the other pile. ' + hostRulesCard(run, service, loc),
      data: { version: 'bomb-pile-totals-v1' } })
  }
  const active = () => !signal.aborted && run.status === 'running' && run.abortEpoch === epoch
  const operationDone = (window: string) => run.events.some(event => event.type === 'operation.batch.completed' && event.data?.window === window)

  if (loc.phase === 'ready') {
    if (!run.events.some(event => event.type === 'host.announcement' && event.game === loc.game && event.round === loc.round)) {
      await hostAnnouncement(run, service, signal)
      return
    }
    const views = await getViews(run, signal)
    if (!active() || await acknowledgeReveals(run, views, epoch, signal)) return
    // Older saved runs may already have discussed this boundary after the previous round.
    // Finish an existing pre-round sweep, but do not start a second discussion for that gap.
    const previousRound = run.events.findLast(event => event.type === 'round.complete'
      && (event.game !== loc.game || event.round !== loc.round))
    const alreadyDiscussed = previousRound && run.events.some(event => event.type === 'discussion.closed'
      && event.game === previousRound.game && event.round === previousRound.round && event.data?.discussionStage === 'post-round')
    const phaseEvents = discussionEvents(run, service, 'pre-round')
    if (!alreadyDiscussed || phaseEvents.some(event => event.type === 'discussion.sweep-started')) {
      const unsettled = phaseEvents.find(event => event.type === 'discussion.beat'
        && !operationDone('pre-round:' + loc.game + ':' + loc.round + ':' + event.data?.sweepId))
      if (unsettled) {
        await operationBarrier(run, service, views, epoch, signal, 'pre-round:' + loc.game + ':' + loc.round + ':' + unsettled.data?.sweepId)
        return
      }
      if (!await discussionPhase(run, service, 'pre-round', undefined, epoch, signal)) return
      const finalWindow = 'pre-settlement:' + loc.game + ':' + loc.round
      if (!operationDone(finalWindow)) {
        await operationBarrier(run, service, views, epoch, signal, finalWindow)
        return
      }
    }
    if (!active()) return
    const requestId = randomUUID()
    await appendEvent(run, { audience: 'observer', type: 'host.command-intent', game: loc.game, round: loc.round,
      data: { operation: 'start', requestId, expectedToken: service.state.current.token } })
    if (!active()) return
    await controlSession(sessionId, 'start', service.state.current.token, requestId, signal)
    if (!active()) return
    await appendEvent(run, { audience: 'observer', type: 'host.command-accepted', data: { requestId, operation: 'start' } })
    await appendEvent(run, { audience: 'observer', type: 'round.started', game: loc.game, round: loc.round })
    await appendEvent(run, { audience: 'public', type: 'host.round-started', game: loc.game, round: loc.round,
      text: 'The round has started. Financial actions are available in their own window, followed by independently collected game choices.' })
    return
  }

  if (loc.phase === 'complete') {
    const views = await getViews(run, signal)
    if (!active() || await acknowledgeReveals(run, views, epoch, signal)) return
    await roundFeedback(run, service, views)
    if (!active()) return
    if (!run.events.some(event => event.type === 'round.complete' && event.game === loc.game && event.round === loc.round)) {
      await appendEvent(run, { audience: 'public', type: 'round.complete', game: loc.game, round: loc.round,
        text: 'The round is complete. Every team has privately received its own payout and updated account. Review these results in the next discussion.' })
    }
    const finalRound = loc.game === 'bomb' && loc.round === 3
    const existingPostDiscussion = discussionEvents(run, service, 'post-round').some(event => event.type === 'discussion.opened')
    if (finalRound || existingPostDiscussion) {
      // Settle promises after every completed discussion sweep, before anyone starts the next sweep.
      const unsettled = discussionEvents(run, service, 'post-round').find(event => event.type === 'discussion.beat'
        && !operationDone('post-round:' + loc.game + ':' + loc.round + ':' + event.data?.sweepId))
      if (unsettled) {
        await operationBarrier(run, service, views, epoch, signal, 'post-round:' + loc.game + ':' + loc.round + ':' + unsettled.data?.sweepId)
        return
      }
      if (!await discussionPhase(run, service, 'post-round', undefined, epoch, signal)) return
      const finalWindow = 'post-settlement:' + loc.game + ':' + loc.round
      if (!operationDone(finalWindow)) {
        await operationBarrier(run, service, views, epoch, signal, finalWindow)
        return
      }
    }
    if (!active()) return
    const requestId = randomUUID()
    await appendEvent(run, { audience: 'observer', type: 'host.command-intent', game: loc.game, round: loc.round,
      data: { operation: 'prepare', requestId, expectedToken: service.state.current.token } })
    if (!active()) return
    service = await controlSession(sessionId, 'prepare', service.state.current.token, requestId, signal)
    if (!active()) return
    await appendEvent(run, { audience: 'observer', type: 'host.command-accepted', data: { requestId, operation: 'prepare' } })
    if (service.status === 'finished' || service.state?.status === 'finished') await finishRun(run, service)
    return
  }

  if (!run.events.some(event => event.type === 'host.announcement' && event.game === loc.game && event.round === loc.round)) {
    await hostAnnouncement(run, service, signal)
    return
  }
  if (!run.events.some(event => event.type === 'host.round-started' && event.game === loc.game && event.round === loc.round)) {
    await appendEvent(run, { audience: 'public', type: 'host.round-started', game: loc.game, round: loc.round,
      text: 'The round is underway. Financial actions and independently collected game decisions are now available in their separate turns.' })
  }
  const views = await getViews(run, signal)
  if (!active() || await acknowledgeReveals(run, views, epoch, signal)) return
  const inCave = service.state?.current?.game === 'cave'
  const caveWindow = inCave ? Number(service.state.current.tick) : undefined
  if (inCave && !await discussionPhase(run, service, 'cave-discussion', caveWindow, epoch, signal)) return

  const window = operationWindow(service)
  if (!operationDone(window)) {
    await operationBarrier(run, service, views, epoch, signal)
    return
  }
  const decision = await decisionBarrier(run, service, views, epoch, signal)
  if (!active() || decision === 'recollect' || decision === 'cancelled') return
  service = await getServiceView(sessionId, signal)
  if (!active() || isRoundComplete(service)) return
  if (service.state?.current?.game === 'cave' && service.state?.current?.phase === 'cave' && service.state?.current?.nextTickAt != null) {
    const requestId = randomUUID()
    const caveToken = service.state.current.token
    await appendEvent(run, { audience: 'observer', type: 'cave.logical-tick-intent', game: 'cave', round: service.state.round,
      data: { requestId, operation: 'tick', expectedToken: String(caveToken), window: service.state.current.tick, revision: service.revision } })
    if (!active()) return
    service = await controlSession(sessionId, 'tick', String(caveToken), requestId, signal)
    if (!active()) return
    await appendEvent(run, { audience: 'observer', type: 'host.command-accepted', data: { requestId, operation: 'tick' } })
    await appendEvent(run, { audience: 'public', type: 'cave.window', game: 'cave', round: service.state.round,
      logicalTime: service.logicalTime, text: service.state.current.phase === 'complete' ? 'The cave round has ended.' : 'The cave clock advances to the next decision window.' })
  }
}

export async function resumeRun(run: RunRecord) {
  if (run.status !== 'paused') throw new Error('Only paused runs can resume')
  const until = Date.now() + 5000
  while (running.has(run.id) && Date.now() < until) await wait(10)
  if (running.has(run.id)) throw new Error('Previous model calls are still settling; retry resume shortly')
  if (run.status !== 'paused') throw new Error('Run changed state while waiting to resume')
  run.error = undefined; run.errorCode = undefined; run.errorDetails = undefined
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
  run.status = 'running'; run.error = undefined; run.errorCode = undefined; run.errorDetails = undefined; await saveRun(run)
  const controller = new AbortController(); controllers.set(run.id, controller)
  const started = Date.now()
  try { await stepRun(run, epoch, controller.signal) }
  catch (error) {
    if (run.status === 'running') {
      run.status = 'paused'; run.error = error instanceof Error ? error.message : String(error)
      await appendEvent(run, { audience: 'observer', type: 'run.paused-error', data: { message: run.error } })
    }
    throw error
  }
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
