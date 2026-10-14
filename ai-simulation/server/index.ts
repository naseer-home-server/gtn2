import { timingSafeEqual, randomUUID } from 'node:crypto'
import path from 'node:path'
import express from 'express'
import { gameConfigSchema } from 'backend/engine'
import { defaults, defaultOptions, operatorToken, providerConfig, publicDir, serviceKey, validateOptions } from './config.js'
import { detail, getRun, listRuns, loadStore, saveRun, summary } from './store.js'
import { beginRun, pauseRun, resumeRun, stepPausedRun, kickRun } from './runner.js'
import { getPlayerView } from './game-client.js'
import type { CreateRunRequest, RunRecord } from './types.js'

const app = express()
let createRunInProgress = false
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!operatorToken) return res.status(503).json({ error: 'SIMULATION_OPERATOR_TOKEN is not configured' })
  const origin = req.get('origin')
  if (origin) {
    try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin requests are not allowed' }) }
    catch { return res.status(403).json({ error: 'Invalid request origin' }) }
  }
  const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')
  if (!match || !sameSecret(match[1]!, operatorToken)) return res.status(401).json({ error: 'Operator login required' })
  next()
}
function audienceOf(value: unknown) {
  const audience = typeof value === 'string' ? value : 'observer'
  return audience === 'public' || audience === 'observer' || /^[a-zA-Z0-9_-]{1,100}$/.test(audience) ? audience : 'observer'
}
async function hydratedDetail(run: RunRecord, audience: string) {
  const result = detail(run, audience)
  if (!run.sessionId || audience === 'public') return result
  const permitted = audience === 'observer' ? run.agents : run.agents.filter((agent) => agent.id === audience)
  for (const agentView of result.agents) {
    const actor = permitted.find((agent) => agent.id === agentView.agent.id)
    if (actor) {
      try { agentView.view = await getPlayerView(run.sessionId, actor) }
      catch { /* Keep the last stored receipts available while the backend is temporarily unreachable. */ }
    }
  }
  return result
}

app.get('/api/config', (_req, res) => res.json({
  defaults, defaultsRun: defaultOptions,
  provider: { configured: Boolean(providerConfig.apiKey && providerConfig.hostModel && providerConfig.playerModel), hostModel: providerConfig.hostModel, playerModel: providerConfig.playerModel },
}))
app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.post('/api/auth/login', (req, res) => {
  if (!operatorToken) return res.status(503).json({ error: 'SIMULATION_OPERATOR_TOKEN is not configured' })
  const supplied = typeof req.body?.token === 'string' ? req.body.token : ''
  if (!sameSecret(supplied, operatorToken)) return res.status(401).json({ error: 'Invalid operator token' })
  return res.json({ ok: true })
})

app.use('/api/runs', auth)
app.get('/api/runs', (_req, res) => res.json({ runs: listRuns().map(summary) }))
app.post('/api/runs', async (req, res, next) => {
  if (createRunInProgress) return res.status(409).json({ error: 'Another simulation is being created.' })
  createRunInProgress = true
  try {
    if (!serviceKey) return res.status(503).json({ error: 'SIMULATION_SERVICE_KEY is not configured for the game API' })
    if (listRuns().some((run) => ['created', 'running', 'paused'].includes(run.status))) return res.status(409).json({ error: 'Stop or finish the current simulation before creating another run.' })
    const body = req.body as CreateRunRequest
    const config = gameConfigSchema.parse(body?.config || defaults)
    const options = validateOptions(body?.options || {})
    if (options.mode === 'openai' && !providerConfig.apiKey) return res.status(400).json({ error: 'OpenAI mode requires OPENAI_API_KEY on the server' })
    const now = new Date().toISOString()
    const run: RunRecord = {
      id: randomUUID(), name: (typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : `Simulation ${new Date().toLocaleString()}`),
      status: 'created', createdAt: now, updatedAt: now, options, config, agents: [], events: [], cursor: 0,
      stepCount: 0, tokensUsed: 0, revision: 0, abortEpoch: 0, memories: {},
      elapsedMs: 0,
    }
    await saveRun(run)
    try { await beginRun(run) }
    catch (error) { run.status = 'failed'; run.error = error instanceof Error ? error.message : String(error); await saveRun(run); throw error }
    return res.status(201).json(await hydratedDetail(run, 'observer'))
  } catch (error) { next(error) }
  finally { createRunInProgress = false }
})
app.get('/api/runs/:id/export', async (req, res, next) => {
  try {
    const run = getRun(req.params.id!)
    if (!run) return res.status(404).json({ error: 'Run not found' })
    const audience = audienceOf(req.query.audience)
    if (audience !== 'observer' && audience !== 'public' && !run.agents.some((agent) => agent.id === audience)) return res.status(404).json({ error: 'View not found' })
    return res.json(await hydratedDetail(run, audience))
  } catch (error) { next(error) }
})
app.get('/api/runs/:id', async (req, res, next) => {
  try {
    const run = getRun(req.params.id!)
    if (!run) return res.status(404).json({ error: 'Run not found' })
    const audience = audienceOf(req.query.audience)
    if (audience !== 'observer' && audience !== 'public' && !run.agents.some((agent) => agent.id === audience)) return res.status(404).json({ error: 'View not found' })
    return res.json(await hydratedDetail(run, audience))
  } catch (error) { next(error) }
})
app.post('/api/runs/:id/control', async (req, res, next) => {
  try {
    const run = getRun(req.params.id!)
    if (!run) return res.status(404).json({ error: 'Run not found' })
    const operation = req.body?.operation
    if (operation === 'pause') await pauseRun(run)
    else if (operation === 'stop') await pauseRun(run, true)
    else if (operation === 'resume') await resumeRun(run)
    else if (operation === 'step') await stepPausedRun(run)
    else return res.status(400).json({ error: 'operation must be pause, resume, stop, or step' })
    return res.json(await hydratedDetail(run, 'observer'))
  } catch (error) { next(error) }
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }))
app.use(express.static(publicDir, { index: false, fallthrough: true }))
app.get('*', (_req, res, next) => {
  if (_req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(publicDir, 'index.html'), (error) => { if (error) next(error) })
})
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error'
  const status = (error as any)?.status || ((error as any)?.name === 'ZodError' ? 400 : 500)
  res.status(status).json({ error: message })
})

await loadStore()
const port = Number(process.env.PORT || 3010)
const host = process.env.HOST || '0.0.0.0'
const server = app.listen(port, host, () => console.log(`AI simulation server listening on ${host}:${port}`))
for (const run of listRuns()) if (run.status === 'running') kickRun(run.id)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)))
