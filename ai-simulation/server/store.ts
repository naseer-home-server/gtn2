import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { dataDir, defaultOptions } from './config.js'
import type { RunRecord, RunEvent, RunSummary, RunDetail, PublicAgent } from './types.js'
import { restoreUsage } from './usage.js'

const file = path.join(dataDir, 'runs.json')
let records = new Map<string, RunRecord>()
let writeChain = Promise.resolve()

export async function loadStore() {
  await mkdir(dataDir, { recursive: true, mode: 0o700 })
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as RunRecord[]
    records = new Map(value.map((r) => [r.id, r]))
    for (const run of records.values()) {
      const { maxTokens: _legacyTokenBudget, ...options } = run.options as typeof run.options & { maxTokens?: unknown }
      run.options = options
      run.elapsedMs ??= 0
      run.options.maxToolAttempts ??= defaultOptions.maxToolAttempts
      run.options.hostContextTokens ??= defaultOptions.hostContextTokens
      run.options.playerContextTokens ??= defaultOptions.playerContextTokens
      restoreUsage(run)
      if (run.status === 'running' || run.status === 'stopping' || run.status === 'created') run.status = 'paused'
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
async function persist() {
  const snapshot = JSON.stringify([...records.values()])
  writeChain = writeChain.then(async () => {
    const temp = `${file}.${randomUUID()}.tmp`
    await writeFile(temp, snapshot, { mode: 0o600 })
    await chmod(temp, 0o600)
    await rename(temp, file)
  })
  return writeChain
}
export function getRun(id: string) { return records.get(id) }
export function listRuns() { return [...records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
export async function saveRun(run: RunRecord) { run.updatedAt = new Date().toISOString(); run.revision += 1; records.set(run.id, run); await persist(); return run }
export async function appendEvent(run: RunRecord, input: Omit<RunEvent, 'id' | 'runId' | 'sequence' | 'wallTime'>) {
  const event: RunEvent = { ...input, id: randomUUID(), runId: run.id, sequence: ++run.cursor, wallTime: new Date().toISOString() }
  run.events.push(event); await saveRun(run); return event
}
export function summary(run: RunRecord): RunSummary {
  const { agents, events, memories: _memories, ...rest } = run
  return { ...rest, agents: agents.map(({ id, name, teamId }) => ({ id, name, teamId } satisfies PublicAgent)), eventCount: events.length }
}
export function detail(run: RunRecord, audience = 'observer'): RunDetail {
  const observer = audience === 'observer'
  const visibleEvents = run.events.filter((event) => observer || event.audience === 'public' || event.audience === audience)
  const visibleAgents = run.agents.filter((agent) => observer || audience === 'public' || audience === agent.id)
  const safeSummary = summary(run)
  if (!observer) {
    safeSummary.error = undefined
    safeSummary.errorCode = undefined; safeSummary.errorDetails = undefined; safeSummary.modelUsage = undefined
    safeSummary.config = undefined
    safeSummary.sessionId = undefined
    safeSummary.options = { ...run.options, seed: undefined, hostModel: '', playerModel: '' }
  }
  return {
    summary: safeSummary, events: visibleEvents,
    transcript: visibleEvents.filter((event) => event.audience === 'public'),
    agents: visibleAgents.map((agent) => {
      const safeAgent = { id: agent.id, name: agent.name, teamId: agent.teamId }
      const privateEvents = visibleEvents.filter((event) => event.audience === agent.id)
      const cached = [...privateEvents].reverse().find((event) => event.type === 'player.view-observed')
      return { agent: safeAgent, privateEvents: observer || audience === agent.id ? privateEvents : [], ...(cached?.data?.view ? { view: cached.data.view as any } : {}) }
    }),
  }
}
