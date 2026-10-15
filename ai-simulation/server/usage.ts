import type { CompletionUsage, RequestContext } from './context.js'
import type { ModelTokenUsage, RunRecord } from './types.js'

function actorUsage(run: RunRecord, actorId: string, model: string): ModelTokenUsage {
  run.modelUsage ??= {}
  return run.modelUsage[actorId] ??= { model, calls: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0 }
}
export function recordRequest(run: RunRecord, actorId: string, request: RequestContext) {
  Object.assign(actorUsage(run, actorId, request.model), {
    model: request.model, lastRequestBytes: request.requestBytes, lastEstimatedPromptTokens: request.estimatedPromptTokens,
    reservedOutputTokens: request.reservedOutputTokens, contextWindowTokens: request.contextWindowTokens, contextSource: request.contextSource,
  })
}
export function recordUsage(run: RunRecord, actorId: string, usage: Partial<CompletionUsage> & { model: string; totalTokens: number }) {
  const stats = actorUsage(run, actorId, usage.model)
  stats.calls++; stats.totalTokens += usage.totalTokens
  stats.promptTokens += usage.promptTokens || 0; stats.completionTokens += usage.completionTokens || 0
  stats.promptUsageCalls = (stats.promptUsageCalls || 0) + Number(usage.promptTokens !== undefined)
  stats.completionUsageCalls = (stats.completionUsageCalls || 0) + Number(usage.completionTokens !== undefined)
  stats.lastPromptTokens = usage.promptTokens; stats.lastCompletionTokens = usage.completionTokens; stats.lastTotalTokens = usage.totalTokens
  if (usage.promptTokens !== undefined && usage.requestBytes) {
    stats.calibrationPromptTokens = usage.promptTokens; stats.calibrationRequestBytes = usage.requestBytes
  }
}
export function restoreUsage(run: RunRecord) {
  if (run.modelUsage) return
  run.modelUsage = {}
  for (const event of run.events) {
    if (event.type !== 'model.host-usage' && event.type !== 'model.player-usage') continue
    const data = event.data || {}
    const actorId = event.type === 'model.host-usage' ? 'host' : data.agentId
    if (typeof actorId !== 'string') continue
    const model = typeof data.model === 'string' ? data.model : actorId === 'host' ? run.options.hostModel : run.options.playerModel
    recordUsage(run, actorId, { ...data, model, totalTokens: Number(data.totalTokens ?? data.tokens ?? 0) })
    if (data.contextWindowTokens && data.requestBytes) recordRequest(run, actorId, data as RequestContext)
  }
}
