import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG } from 'backend/engine'
import { ensureSession, hasBarrierPublicMessage, hasPrivateChatObservation, runBudgetLimitReached, type SessionSetupDependencies } from './runner.js'
import type { AgentRecord, RunEvent, RunOptions, RunRecord } from './types.js'

const event = (audience: RunEvent['audience'], type: string, data: Record<string, unknown>): RunEvent => ({
  id: `${type}-${audience}`, runId: 'run', sequence: 1, audience, type, data, wallTime: '2026-10-14T00:00:00.000Z',
})

test('barrier replay recognizes an already-persisted public message before its sent marker', () => {
  const run = { events: [event('public', 'player.message', { barrierId: 'barrier-1', speakerId: 'team-1' })] }
  assert.equal(hasBarrierPublicMessage(run, 'barrier-1', 'team-1'), true)
  assert.equal(hasBarrierPublicMessage(run, 'barrier-2', 'team-1'), false)
  assert.equal(hasBarrierPublicMessage(run, 'barrier-1', 'team-2'), false)
})

test('private chat replay dedupes each recipient observation by stable client message id', () => {
  const run = { events: [event('team-1', 'chat.private-message', { clientMessageId: 'message-1' })] }
  assert.equal(hasPrivateChatObservation(run, 'team-1', 'message-1'), true)
  assert.equal(hasPrivateChatObservation(run, 'team-2', 'message-1'), false)
  assert.equal(hasPrivateChatObservation(run, 'team-1', 'message-2'), false)
})

test('initial session setup retries with the stable run id without duplicating setup events', async () => {
  const options: RunOptions = { teamCount: 2, seed: 41, mode: 'scripted', hostModel: '', playerModel: '', hostReasoningEffort: 'high', playerReasoningEffort: 'high', minDiscussionBeats: 0,
    maxDiscussionBeats: 0, caveDiscussionBeats: 0, maxSteps: 20, maxWallTimeMs: 60_000, maxToolAttempts: 1, hostContextTokens: 128000, playerContextTokens: 128000 }
  const run: RunRecord = { id: 'run-stable-id', name: 'Recovery', status: 'paused', createdAt: '', updatedAt: '', options,
    config: structuredClone(DEFAULT_CONFIG), agents: [], events: [], cursor: 0, stepCount: 0, tokensUsed: 0, revision: 0,
    abortEpoch: 0, elapsedMs: 0, memories: {} }
  const agent: AgentRecord = { id: 'team-1', name: 'Team One', teamId: 'team-id', playerId: 'player-id', email: 'team@example.test', credential: 'capability' }
  const requestIds: string[] = []
  let backendCommitted = false
  let dropFirstResponse = true
  const dependencies: SessionSetupDependencies = {
    async createSession(_name, _teamCount, _seed, _config, requestId) {
      requestIds.push(requestId)
      backendCommitted = true
      if (dropFirstResponse) { dropFirstResponse = false; throw new Error('response lost after backend commit') }
      assert.equal(backendCommitted, true)
      return { sessionId: 'session-recovered', players: [agent] }
    },
    async appendEvent(target, input) {
      const next = { ...input, id: `event-${target.cursor + 1}`, runId: target.id, sequence: ++target.cursor, wallTime: '' }
      target.events.push(next)
      return next
    },
    async saveRun(target) { return target },
  }

  await assert.rejects(ensureSession(run, dependencies), /response lost after backend commit/)
  assert.equal(run.sessionId, undefined)
  await ensureSession(run, dependencies)
  assert.equal(run.sessionId, 'session-recovered')
  assert.deepEqual(requestIds, ['run-stable-id', 'run-stable-id'])
  assert.equal(run.events.filter((item) => item.type === 'run.created').length, 1)
  assert.equal(run.events.filter((item) => item.type === 'session.create-intent').length, 1)
  assert.equal(run.events.filter((item) => item.type === 'session.created').length, 1)
  assert.equal(run.agents[0]?.credential, 'capability')
})

test('run limits enforce wall time and steps while cumulative tokens never block progress', () => {
  const options: RunOptions = { teamCount: 2, seed: 41, mode: 'scripted', hostModel: '', playerModel: '', hostReasoningEffort: 'high', playerReasoningEffort: 'high', minDiscussionBeats: 0,
    maxDiscussionBeats: 0, caveDiscussionBeats: 0, maxSteps: 4, maxWallTimeMs: 1000, maxToolAttempts: 1, hostContextTokens: 128000, playerContextTokens: 128000 }
  const usage = { options, elapsedMs: 0, stepCount: 0, tokensUsed: 0 }
  assert.equal(runBudgetLimitReached(usage), undefined)
  assert.equal(runBudgetLimitReached({ ...usage, elapsedMs: 1000 }), 'wall-time')
  assert.equal(runBudgetLimitReached({ ...usage, stepCount: 4 }), 'steps')
  const legacy = { ...usage, tokensUsed: 2_606_867, options: { ...options, maxTokens: 1 } }
  assert.equal(runBudgetLimitReached(legacy), undefined)
})
