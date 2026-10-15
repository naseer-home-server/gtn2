import { providerConfig } from './config.js'

export type ContextInfo = { model: string; contextWindowTokens: number; contextSource: 'configured' | 'provider'; maxOutputTokens: number; outputSource?: 'configured' | 'provider' }
export type RequestContext = ContextInfo & { requestBytes: number; estimatedPromptTokens: number; reservedOutputTokens: number }
export type CompletionUsage = RequestContext & { promptTokens?: number; completionTokens?: number; totalTokens: number; finishReason?: string; reasoningTokens?: number }
export class ModelContextError extends Error {
  constructor(readonly code: 'MODEL_CONTEXT_LIMIT' | 'MODEL_CONTEXT_LIMIT_UNKNOWN', readonly details: Record<string, unknown>, message: string) {
    super(code + ': ' + message); this.name = 'ModelContextError'
  }
}
export class ModelOutputLimitUnknown extends Error {
  readonly code = 'MODEL_OUTPUT_LIMIT_UNKNOWN'
  constructor(readonly details: Record<string, unknown>) {
    super('No maximum output length was published for ' + details.model + '. Set its documented maximum in SIM_HOST_MAX_OUTPUT_TOKENS / SIM_PLAYER_MAX_OUTPUT_TOKENS, then restart and resume. No arbitrary output cap has been assumed.')
    this.name = 'ModelOutputLimitUnknown'
  }
}

const catalogues = new Map<string, { expires: number; models: Promise<any[]> }>()
const positiveInteger = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
export async function resolveModelContext(model: string, configured: number, signal?: AbortSignal, configuredOutput = 0): Promise<ContextInfo> {
  const explicitContext = positiveInteger(configured), explicitOutput = positiveInteger(configuredOutput)
  if (explicitContext && explicitOutput) return { model, contextWindowTokens: explicitContext, contextSource: 'configured', maxOutputTokens: explicitOutput, outputSource: 'configured' }
  const key = providerConfig.baseUrl + '\0' + providerConfig.apiKey
  let catalogue = catalogues.get(key)
  if (!catalogue || catalogue.expires < Date.now()) {
    const models = (async () => {
      try {
        const response = await fetch(providerConfig.baseUrl + '/models', {
          headers: { authorization: 'Bearer ' + providerConfig.apiKey }, signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) return []
        const body = await response.json() as any
        return Array.isArray(body.data) ? body.data : []
      } catch { return [] }
    })()
    catalogue = { expires: Date.now() + 5 * 60_000, models }; catalogues.set(key, catalogue)
  }
  signal?.throwIfAborted()
  // One actor cancelling must not cancel another actor's shared metadata lookup.
  const models = await catalogue.models
  signal?.throwIfAborted()
  const found = models.find(entry => entry?.id === model)
  const limits = [found?.context_length, found?.context_window, found?.top_provider?.context_length].map(positiveInteger).filter((value): value is number => value !== undefined)
  if (!explicitContext && !limits.length) throw new ModelContextError('MODEL_CONTEXT_LIMIT_UNKNOWN', { model },
    'No context window was published for ' + model + '. Set the host/player context tokens in run setup or SIM_HOST_CONTEXT_TOKENS / SIM_PLAYER_CONTEXT_TOKENS on the server.')
  const outputLimits = [found?.top_provider?.max_completion_tokens, found?.max_output_tokens, found?.max_completion_tokens]
    .map(positiveInteger).filter((value): value is number => value !== undefined)
  const maxOutputTokens = outputLimits.length ? Math.min(...outputLimits) : explicitOutput
  if (!maxOutputTokens) throw new ModelOutputLimitUnknown({ model })
  return { model, contextWindowTokens: explicitContext || Math.min(...limits), contextSource: explicitContext ? 'configured' : 'provider',
    maxOutputTokens, outputSource: outputLimits.length ? 'provider' : 'configured' }
}

export function sizeRequest(messages: Array<Record<string, unknown>>, tools: unknown, context: ContextInfo,
  calibration?: { promptTokens?: number; requestBytes?: number }): RequestContext {
  const requestBytes = Buffer.byteLength(JSON.stringify({ messages, tools }), 'utf8')
  // Generic compatible models have no common exact preflight tokenizer. Use a conservative
  // estimate, calibrated upwards from provider-reported usage, and label it as an estimate.
  const ratio = calibration?.promptTokens && calibration?.requestBytes ? calibration.promptTokens / calibration.requestBytes : 0
  const estimatedPromptTokens = Math.ceil(requestBytes * Math.max(1 / 3, ratio) * 1.1) + messages.length * 16 + 128
  return { ...context, requestBytes, estimatedPromptTokens, reservedOutputTokens: context.maxOutputTokens }
}
export function checkContext(request: RequestContext, promptTokens = request.estimatedPromptTokens, measured = false) {
  const margin = Math.min(2048, Math.max(128, Math.ceil(request.contextWindowTokens * 0.01)))
  if (promptTokens + request.reservedOutputTokens + margin >= request.contextWindowTokens) {
    throw new ModelContextError('MODEL_CONTEXT_LIMIT', { ...request, promptTokens, measured, safetyMarginTokens: margin },
      request.model + ' needs ' + promptTokens + (measured ? ' reported' : ' estimated') + ' input tokens plus ' +
      request.reservedOutputTokens + ' reserved output tokens; its context window is ' + request.contextWindowTokens + '. Full game history has been preserved.')
  }
}
export function isProviderContextError(error: any) {
  return /context[_ -](length|window|limit)|maximum context|too many input tokens|prompt.{0,30}too long/i.test(String(error?.code || '') + ' ' + String(error?.message || ''))
}
