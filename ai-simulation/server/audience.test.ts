import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CONFIG } from 'backend/engine'
import { detail } from './store.js'
import type { RunRecord } from './types.js'

function fixture(): RunRecord {
  return {
    id: 'run-1', name: 'Trial', status: 'running', createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z',
    options: { teamCount: 2, seed: 17, mode: 'scripted', hostModel: 'secret-host', playerModel: 'secret-player', hostReasoningEffort: 'high', playerReasoningEffort: 'high', minDiscussionBeats: 1,
      maxDiscussionBeats: 2, caveDiscussionBeats: 1, maxSteps: 100, maxWallTimeMs: 60_000, maxToolAttempts: 1, hostContextTokens: 128000, playerContextTokens: 128000 },
    config: structuredClone(DEFAULT_CONFIG), sessionId: 'session-secret',
    agents: [
      { id: 'team-1', name: 'Team One', teamId: 't1', playerId: 'player-secret-1', email: 'one@example.test', credential: 'capability-secret-1' },
      { id: 'team-2', name: 'Team Two', teamId: 't2', playerId: 'player-secret-2', email: 'two@example.test', credential: 'capability-secret-2' },
    ],
    events: [
      { id: 'e1', runId: 'run-1', sequence: 1, audience: 'public', type: 'player.message', text: 'hello', data: { speakerId: 'team-1', speakerName: 'Team One' }, wallTime: '2026-10-14T00:00:00Z' },
      { id: 'e2', runId: 'run-1', sequence: 2, audience: 'team-1', type: 'reveal.acknowledged', data: { scope: 'self', rankings: [{ teamId: 't1', rank: 1 }] }, wallTime: '2026-10-14T00:00:01Z' },
      { id: 'e3', runId: 'run-1', sequence: 3, audience: 'team-2', type: 'chat.private-message', text: 'private', wallTime: '2026-10-14T00:00:02Z' },
      { id: 'e4', runId: 'run-1', sequence: 4, audience: 'observer', type: 'final.standings', data: { standings: [{ teamId: 't1', balance: '999999999999999999999.99' }] }, wallTime: '2026-10-14T00:00:03Z' },
    ],
    cursor: 4, stepCount: 2, tokensUsed: 0, revision: 1, abortEpoch: 0, elapsedMs: 100, memories: {},
  }
}

test('team detail keeps only public and own private history and strips operator configuration', () => {
  const one = detail(fixture(), 'team-1')
  const serialized = JSON.stringify(one)
  assert.deepEqual(one.events.map((event) => event.type), ['player.message', 'reveal.acknowledged'])
  assert.equal(one.agents.length, 1)
  assert.equal(one.summary.config, undefined)
  assert.equal(one.summary.sessionId, undefined)
  assert.equal(one.summary.options.seed, undefined)
  assert.equal(one.summary.options.hostModel, '')
  assert.equal(serialized.includes('capability-secret'), false)
  assert.equal(serialized.includes('session-secret'), false)
  assert.equal(serialized.includes('999999999999999999999.99'), false)
})

test('public view contains only public events while observer retains final results', () => {
  const publicView = detail(fixture(), 'public')
  const observer = detail(fixture(), 'observer')
  assert.deepEqual(publicView.events.map((event) => event.type), ['player.message'])
  assert.ok(publicView.agents.every((agent) => agent.privateEvents.length === 0))
  assert.ok(observer.events.some((event) => event.type === 'final.standings'))
  assert.equal(JSON.stringify(observer).includes('capability-secret'), false)
})
