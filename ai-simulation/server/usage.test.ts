import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG } from 'backend/engine'
import { defaultOptions } from './config.js'
import { checkContext, type RequestContext } from './context.js'
import { recordRequest, recordUsage, restoreUsage } from './usage.js'
import type { RunRecord } from './types.js'

function fixture(): RunRecord {
  return { id: 'metrics', name: 'Metrics', status: 'paused', createdAt: '', updatedAt: '', options: { ...defaultOptions },
    config: structuredClone(DEFAULT_CONFIG), agents: [], events: [], cursor: 0, stepCount: 0, tokensUsed: 0, revision: 0,
    abortEpoch: 0, elapsedMs: 0, memories: {} }
}
const request: RequestContext = { model: 'mock', contextWindowTokens: 1000, contextSource: 'configured',
  requestBytes: 300, estimatedPromptTokens: 120, reservedOutputTokens: 50, maxOutputTokens: 50 }

test('per-agent cumulative usage stays separate from the current request context window', () => {
  const run = fixture()
  recordRequest(run, 'team-1', request)
  for (let i = 0; i < 100; i++) recordUsage(run, 'team-1', { ...request, promptTokens: 100, completionTokens: 10, totalTokens: 110 })
  const stats = run.modelUsage!['team-1']!
  assert.equal(stats.calls, 100)
  assert.equal(stats.totalTokens, 11000)
  assert.equal(stats.promptTokens, 10000)
  assert.equal(stats.completionTokens, 1000)
  assert.equal(stats.lastPromptTokens, 100)
  assert.equal(stats.calibrationPromptTokens, 100)
  assert.equal(stats.calibrationRequestBytes, 300)
  assert.equal(stats.promptUsageCalls, 100)
  assert.doesNotThrow(() => checkContext(request, stats.lastPromptTokens, true))
  recordUsage(run, 'host', { ...request, totalTokens: 7 })
  assert.equal(run.modelUsage!.host?.totalTokens, 7)
  assert.equal(run.modelUsage!.host?.promptUsageCalls, 0)
})

test('older runs reconstruct available usage without inventing missing prompt/output counts or counting twice', () => {
  const run = fixture()
  run.options.hostModel = 'old-host'; run.options.playerModel = 'old-player'
  run.events = [
    { id: 'old', runId: run.id, audience: 'observer', type: 'model.host-usage', sequence: 1, wallTime: '', data: { tokens: 500 } },
    { id: 'new', runId: run.id, audience: 'observer', type: 'model.player-usage', sequence: 2, wallTime: '',
      data: { ...request, agentId: 'team-1', promptTokens: 20, completionTokens: 3, totalTokens: 23 } },
  ]
  restoreUsage(run)
  assert.equal(run.modelUsage!.host?.model, 'old-host')
  assert.equal(run.modelUsage!.host?.totalTokens, 500)
  assert.equal(run.modelUsage!.host?.promptUsageCalls, 0)
  assert.equal(run.modelUsage!['team-1']?.totalTokens, 23)
  assert.equal(run.modelUsage!['team-1']?.promptUsageCalls, 1)
  assert.equal(run.modelUsage!['team-1']?.contextWindowTokens, 1000)
  restoreUsage(run)
  assert.equal(run.modelUsage!.host?.totalTokens, 500)
})
