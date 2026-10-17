import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertCircle, ArrowDownToLine, Bot, Check, ChevronDown, CircleHelp,
  CirclePlay, Clock3, Eye, EyeOff, FileUp, KeyRound, LoaderCircle, LockKeyhole,
  MessageSquareText, Pause, Play, Plus, Radio, RotateCcw, Settings2, Shield,
  SkipForward, Square, WandSparkles, X,
} from 'lucide-react'
import type { ConfigResponse, GameConfig, RunDetail, RunEvent, RunOptions, RunSummary } from './types'
import { ActivityCard, GameContext, TeamAccounts } from '../../../game/frontend/src/components/game-activity/ActivityCard'
import { observerAccounts, observerTranscript } from './observer'
import { MIN_TEAMS, MAX_TEAMS } from '../../../game/backend/src/engine/limits'

const tokenKey = 'simulation.operatorToken'
const rounds = ['Round 1', 'Round 2', 'Round 3']
const baseRunOptions: RunOptions = {
  teamCount: 5, seed: 20261014, mode: 'scripted', hostModel: '', playerModel: '',
  hostReasoningEffort: 'high', playerReasoningEffort: 'high',
  minDiscussionBeats: 2, maxDiscussionBeats: 4, caveDiscussionBeats: 1,
  maxSteps: 1000, maxWallTimeMs: 3600000,
  maxToolAttempts: 3,
  hostContextTokens: 0, playerContextTokens: 0,
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(path, { ...init, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || body.message || `Request failed (${response.status})`)
  return body as T
}

type Path = string
type FieldSpec = { path: Path; label: string; min?: number; max?: number; step?: number; integer?: boolean; hint?: string }
type ConfigGroup = { id: string; title: string; description: string; fields: FieldSpec[]; rows?: 'rounds' | 'risk' }
const configGroups: ConfigGroup[] = [
  { id: 'general', title: 'Night settings', description: 'Shared balance and ranking reveal economics.', fields: [
    { path: 'initialBalance', label: 'Starting balance', min: 0, max: 1e12, step: 0.01, hint: 'Starting balance per team.' },
    { path: 'revealPotMultiplier', label: 'Reveal pot multiplier', min: 0.001, max: 1000, step: 0.1, hint: 'Scales median balance ÷ 3 before rounding to the nearest 100 at the next game. Default: 1.' },
  ] },
  { id: 'bonus', title: 'Will we get bonus this year', description: 'Bag, collective threshold, bonus multiplier, and round-three award.', rows: 'rounds', fields: [
    { path: 'bonus.bag', label: 'Bag amount', min: 0, max: 1e12, step: 0.01 },
    { path: 'bonus.threshold', label: 'Collective threshold', min: 0, max: 1e12, step: 0.01 },
    { path: 'bonus.multiplier', label: 'Threshold bonus multiplier', min: 1, max: 1e6, step: 0.1 },
    { path: 'bonus.stars', label: 'Stars for round-three winner', min: 0, max: 1000, step: 1, integer: true },
  ] },
  { id: 'high-low', title: 'High or low', description: 'Choice pool, stake multiplier, and round-three star award.', rows: 'rounds', fields: [
    { path: 'highLow.pool', label: 'Base pool', min: 0, max: 1e12, step: 0.01 },
    { path: 'highLow.multiplier', label: 'Stake multiplier', min: 1, max: 1e6, step: 0.1 },
    { path: 'highLow.stars', label: 'Stars for round-three winner', min: 0, max: 1000, step: 1, integer: true },
  ] },
  { id: 'cave', title: 'Cave mining', description: 'Growth, decision-window duration, collapse risk, and star award.', rows: 'rounds', fields: [
    { path: 'cave.startingMoney', label: 'Starting money', min: 0, max: 1e12, step: 0.01 },
    { path: 'cave.growth', label: 'Growth multiplier', min: 1, max: 1e6, step: 0.1 },
    { path: 'cave.tickSeconds', label: 'Decision window (seconds)', min: 1, max: 3600, step: 1 },
    { path: 'cave.maxTicks', label: 'Maximum ticks', min: 1, max: 1000, step: 1, integer: true, hint: 'The safe opening decision window counts as tick 1.' },
    { path: 'cave.collapseRisk', label: 'Collapse risk by teams departed', min: 0, max: 100, step: 1, hint: 'Percent chance by departures, from 0 to 6. Legacy five-entry tables cap at their last value.' },
    { path: 'cave.stars', label: 'Stars for cave total winner', min: 0, max: 1000, step: 1, integer: true },
  ] },
  { id: 'circle', title: 'What goes around comes around', description: 'Transfer multiplier by round. This game awards no stars.', rows: 'rounds', fields: [
    { path: 'circle.multiplier', label: 'Transfer multiplier', min: 1, max: 1000, step: 1, integer: true },
  ] },
  { id: 'bomb', title: 'Gamble bomb finale', description: 'Chit constraints and bomb factor by round. No finale star award.', rows: 'rounds', fields: [
    { path: 'bomb.minChits', label: 'Minimum chits per pile', min: 1, max: 1000, step: 1, integer: true },
    { path: 'bomb.maxChits', label: 'Standard maximum per pile', min: 1, max: 1000, step: 1, integer: true },
    { path: 'bomb.advantageChits', label: 'Most-starred maximum per pile', min: 1, max: 1000, step: 1, integer: true },
    { path: 'bomb.factor', label: 'Bomb factor', min: 1, max: 1e6, step: 0.1 },
  ] },
]

function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce((value: any, key) => value?.[key], source)
}
function setPath(source: any, path: string, value: unknown): any {
  const [head, ...tail] = path.split('.')
  if (!head) return source
  return { ...source, [head]: tail.length ? setPath(source[head], tail.join('.'), value) : value }
}
function validateConfig(config: any): string | null {
  if (!config || typeof config !== 'object') return 'Configuration must be a JSON object.'
  const paths = configGroups.flatMap(group => group.fields.map(field => field.path))
  for (const path of paths) {
    const val = getPath(config, path)
    const spec = configGroups.flatMap(group => group.fields).find(field => field.path === path)!
    if (Array.isArray(val)) {
      const lengths = path === 'cave.collapseRisk' ? [5, 7] : [3]
      if (!lengths.includes(val.length) || val.some(item => typeof item !== 'number' || !Number.isFinite(item))) return `${path} must contain ${lengths.join(' or ')} finite numbers.`
    } else if (typeof val !== 'number' || !Number.isFinite(val)) return `${path} must be a finite number.`
    const values = Array.isArray(val) ? val : [val]
    if (values.some(item => (spec.min !== undefined && item < spec.min) || (spec.max !== undefined && item > spec.max) || (spec.integer && !Number.isInteger(item)))) return `${spec.label} values must be ${spec.integer ? 'whole numbers ' : ''}between ${spec.min ?? '−∞'} and ${spec.max ?? '∞'}.`
  }
  if (config.bomb.minChits > config.bomb.maxChits || config.bomb.maxChits > config.bomb.advantageChits) return 'Chit limits must be minimum ≤ standard maximum ≤ most-starred maximum.'
  return null
}
function usageTotal(tokens: number, reported: number | undefined, calls: number) {
  return reported === calls && calls > 0 ? tokens.toLocaleString() : reported ? '≥' + tokens.toLocaleString() : '—'
}
function usd(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value)
}
type ModelUsage = NonNullable<RunSummary['modelUsage']>[string]
function formatModelCost(usage: ModelUsage) {
  const actual = usage.actualCostUsd || 0, estimated = usage.estimatedCostUsd || 0
  if (!actual && !estimated && !(usage.calls > (usage.unpricedCalls || 0))) return '—'
  const total = actual + estimated
  return `${estimated ? '~' : ''}${(usage.unpricedCalls || 0) > 0 ? '≥' : ''}${usd(total)}`
}
function formatRunCost(usages?: Record<string, ModelUsage>) {
  const entries = Object.values(usages || {})
  if (!entries.length) return '—'
  const cost = entries.reduce((sum, item) => sum + (item.actualCostUsd || 0) + (item.estimatedCostUsd || 0), 0)
  if (entries.every(item => !(item.actualCostUsd || 0) && !(item.estimatedCostUsd || 0) && !(item.calls > (item.unpricedCalls || 0)))) return '—'
  const estimated = entries.some(item => (item.estimatedCostUsd || 0) > 0)
  const partial = entries.some(item => (item.unpricedCalls || 0) > 0)
  return `${estimated ? '~' : ''}${partial ? '≥' : ''}${usd(cost)}`
}
function prettyTime(value?: number | string) {
  if (value === undefined || value === null || value === '') return '—'
  const number = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(number)) return String(value)
  return new Date(number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function eventText(event: RunEvent): string {
  if (event.text) return event.text
  const data = event.data || {}
  const action = data.action as { type?: string; decision?: string } | undefined
  if (event.type === 'action.accepted' && action?.type === 'cave.decide') return `Private cave decision accepted: ${action.decision}.`
  for (const key of ['message', 'content', 'text', 'summary', 'announcement']) if (typeof data[key] === 'string') return data[key] as string
  return event.type.replaceAll(/[._]/g, ' ')
}
function displayValue(value: unknown) {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}
function statusTone(status?: string) {
  const value = (status || '').toLowerCase()
  if (value === 'running') return 'green'
  if (['paused', 'waiting'].includes(value)) return 'amber'
  if (['failed', 'error', 'stopped'].includes(value)) return 'red'
  return 'slate'
}

function App() {
  const [serverConfig, setServerConfig] = useState<ConfigResponse | null>(null)
  const [config, setConfig] = useState<GameConfig | null>(null)
  const [options, setOptions] = useState<RunOptions>(baseRunOptions)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [audience, setAudience] = useState('observer')
  const [token, setToken] = useState(() => sessionStorage.getItem(tokenKey) || '')
  const [tokenDraft, setTokenDraft] = useState(() => sessionStorage.getItem(tokenKey) || '')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [runName, setRunName] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [expanded, setExpanded] = useState('general')
  const [activePane, setActivePane] = useState<'conversation' | 'inspector'>('conversation')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pastedConfig, setPastedConfig] = useState('')
  const importRef = useRef<HTMLInputElement>(null)
  const listedSummary = runs.find(run => run.id === selectedId)
  const selectedSummary = detail?.summary.id === selectedId && (!listedSummary || detail.summary.revision >= listedSummary.revision) ? detail.summary : listedSummary
  const agents = detail?.agents || []
  const currentAgent = agents.find(item => item.agent.id === audience)
  const audienceAgents = selectedSummary?.agents || agents.map(item => ({ id: item.agent.id, name: item.agent.name, teamId: item.agent.teamId }))
  const configError = config ? validateConfig(config) : null
  const optionsError = options.minDiscussionBeats > options.maxDiscussionBeats ? 'Minimum discussion beats cannot exceed the maximum.' : null
  const isOpenAI = options.mode === 'openai'

  const loadConfig = useCallback(async () => {
    try {
      const result = await request<ConfigResponse>('/api/config')
      setServerConfig(result)
      setConfig(current => current || structuredClone(result.defaults))
      setOptions(current => ({ ...result.defaultsRun, ...current, hostContextTokens: current.hostContextTokens || result.defaultsRun.hostContextTokens, playerContextTokens: current.playerContextTokens || result.defaultsRun.playerContextTokens, hostModel: current.hostModel || result.provider.hostModel, playerModel: current.playerModel || result.provider.playerModel }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load simulation configuration.') }
    finally { setLoading(false) }
  }, [])

  const loadRuns = useCallback(async (auth = token) => {
    if (!auth) return
    try {
      const result = await request<{ runs: RunSummary[] }>('/api/runs', auth)
      setRuns(current => (result.runs || []).map(incoming => {
        const previous = current.find(run => run.id === incoming.id)
        return previous && previous.revision > incoming.revision ? previous : incoming
      }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load run history.') }
  }, [token])

  const loadDetail = useCallback(async (id = selectedId, auth = token, view = audience) => {
    if (!id || !auth) return
    try {
      const result = await request<RunDetail>(`/api/runs/${encodeURIComponent(id)}?audience=${encodeURIComponent(view)}`, auth)
      setDetail(current => current?.summary.id === result.summary.id && current.summary.revision > result.summary.revision ? current : result)
      setRuns(current => current.map(run => run.id === result.summary.id && run.revision <= result.summary.revision ? result.summary : run))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load run details.') }
  }, [selectedId, token, audience])

  useEffect(() => { void loadConfig() }, [loadConfig])
  useEffect(() => { void loadRuns() }, [loadRuns])
  useEffect(() => { if (selectedId && token) void loadDetail() }, [selectedId, token, audience, loadDetail])
  useEffect(() => {
    if (!selectedSummary || selectedSummary.status !== 'running') return
    const id = selectedId
    const timer = window.setInterval(() => { void loadRuns(); void loadDetail(id) }, 2200)
    return () => window.clearInterval(timer)
  }, [selectedId, selectedSummary?.status, loadDetail, loadRuns])

  function updateConfig(path: string, index: number | null, raw: string) {
    if (!config) return
    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) return
    const current = getPath(config, path)
    const value = index === null ? numeric : Array.isArray(current) ? current.map((item, i) => i === index ? numeric : item) : current
    setConfig(setPath(config, path, value))
  }
  function resetConfig() {
    if (serverConfig) setConfig(structuredClone(serverConfig.defaults))
  }
  function exportConfig() {
    if (!config) return
    downloadJson(config, 'game-config.json')
    setNotice('Configuration downloaded.')
  }
  function applyImportedConfig(text: string) {
    try {
      const parsed = JSON.parse(text)
      const problem = validateConfig(parsed)
      if (problem) throw new Error(problem)
      setConfig(parsed as GameConfig)
      setNotice('Configuration imported.')
      setError('')
      setPasteOpen(false)
      setPastedConfig('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not import configuration.') }
  }
  async function importConfig(file?: File) {
    if (!file) return
    try { applyImportedConfig(await file.text()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read configuration file.') }
  }
  async function authenticate(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setError('')
    try {
      await request('/api/auth/login', undefined, { method: 'POST', body: JSON.stringify({ token: tokenDraft }) })
      sessionStorage.setItem(tokenKey, tokenDraft); setToken(tokenDraft); setNotice('Operator access connected.')
      await loadRuns(tokenDraft)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Operator access was rejected.') }
    finally { setWorking(false) }
  }
  function disconnect() {
    sessionStorage.removeItem(tokenKey); setToken(''); setTokenDraft(''); setRuns([]); setDetail(null); setSelectedId(''); setNotice('Operator access disconnected.')
  }
  async function createRun(event: React.FormEvent) {
    event.preventDefault()
    if (!config || !token || configError || optionsError) return
    setWorking(true); setError(''); setNotice('')
    try {
      const created = await request<RunDetail>('/api/runs', token, { method: 'POST', body: JSON.stringify({ name: runName.trim() || undefined, config, options }) })
      setDetail(created); setSelectedId(created.summary.id); setAudience('observer'); setRunName('')
      await loadRuns()
      setNotice('Run created and started with this configuration snapshot.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start the run.') }
    finally { setWorking(false) }
  }
  async function control(operation: 'pause' | 'resume' | 'stop' | 'step') {
    if (!selectedId || !token) return
    setWorking(true); setError(''); setNotice('')
    try {
      const next = await request<RunDetail>(`/api/runs/${encodeURIComponent(selectedId)}/control`, token, { method: 'POST', body: JSON.stringify({ operation }) })
      setDetail(current => current?.summary.id === next.summary.id && current.summary.revision > next.summary.revision ? current : next)
      setRuns(current => current.map(run => run.id === next.summary.id && run.revision <= next.summary.revision ? next.summary : run))
      setNotice(operation === 'step' ? 'Advanced one simulation step.' : `Run ${operation} requested.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${operation} the run.`) }
    finally { setWorking(false) }
  }
  async function exportReplay() {
    if (!selectedId || !token) return
    try {
      const replay = await request<unknown>(`/api/runs/${encodeURIComponent(selectedId)}/export?audience=${encodeURIComponent(audience)}`, token)
      downloadJson(replay, `${selectedId}-${audience}-replay.json`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not export replay.') }
  }
  function chooseRun(run: RunSummary) { setSelectedId(run.id); setDetail(null); setAudience('observer') }

  const timeline = useMemo(() => detail?.events || [], [detail])
  const conversationEvents = timeline.filter(event => event.type !== 'game.public-state' && (audience === 'observer' ? (event.audience === 'public' || event.type === 'model.validation-error' || event.type === 'model.context-limit' || event.type === 'model.request-error' || event.type === 'model.output-limit' || (event.type === 'action.accepted' && (event.data?.action as { type?: string } | undefined)?.type === 'cave.decide')) : true))
    .map(event => event.type === 'action.accepted' ? { ...event, data: { ...event.data, speakerName: agents.find(item => item.agent.id === event.audience)?.agent.name || event.audience } } : event)
  const observerView = audience === 'observer'
  const accountTeams = useMemo(() => detail && observerView ? observerAccounts(detail) : [], [detail, observerView])
  const observerItems = useMemo(() => detail && observerView ? observerTranscript(detail, accountTeams) : [], [detail, observerView, accountTeams])
  const conversationCount = observerView ? observerItems.length : conversationEvents.length
  const visibleEventCount = detail ? timeline.length : observerView ? selectedSummary?.eventCount || 0 : 0
  const visibleStepCount = observerView ? selectedSummary?.stepCount || 0 : undefined
  const visibleTokenCount = observerView ? selectedSummary?.tokensUsed || 0 : undefined
  const visibleAgentCount = observerView ? selectedSummary?.agents?.length || 0 : audience === 'public' ? 0 : detail?.agents.length || 1
  const progress = observerView && selectedSummary ? Math.min(100, Math.round(((selectedSummary.stepCount || 0) / Math.max(1, selectedSummary.options?.maxSteps || 1000)) * 100)) : 0

  if (loading) return <main className="loading"><LoaderCircle className="spin" /> Loading simulation console…</main>

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark"><WandSparkles size={18} /></span><span><strong>Game Theory Night</strong><small>Simulation console</small></span></a>
      <div className="topbar-right"><span className={`api-indicator ${serverConfig ? 'online' : ''}`}><i />{serverConfig ? 'Runner connected' : 'Runner unavailable'}</span><button className="icon-button" title="Operator access" onClick={() => document.getElementById('operator-token')?.focus()}><Shield size={17} /></button></div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-section-title"><span>EXPERIMENT</span><Settings2 size={14} /></div>
        <button className={`side-link ${!selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(''); setDetail(null) }}><Plus size={16} /> New simulation</button>
        <div className="history-head"><span>RUN HISTORY</span><button className="icon-button tiny" title="Refresh history" onClick={() => void loadRuns()}><RotateCcw size={13} /></button></div>
        {runs.length === 0 ? <p className="empty-history">Runs will appear here.</p> : <div className="run-list">{runs.map(run => <button key={run.id} className={`run-item ${run.id === selectedId ? 'current' : ''}`} onClick={() => chooseRun(run)}>
          <span className={`status-dot ${statusTone(run.status)}`} /><span className="run-item-copy"><strong>{run.name || `Simulation ${run.id.slice(0, 8)}`}</strong><small>{run.options?.mode || 'run'} · {prettyTime(run.createdAt)}</small></span><span className={`mini-status ${statusTone(run.status)}`}>{run.status}</span>
        </button>)}</div>}
        <div className="sidebar-bottom">
          <div className="provider-card"><div className="provider-icon"><KeyRound size={16} /></div><div><strong>Model provider</strong><small>{serverConfig?.provider.configured ? 'Server key configured' : 'Server key not configured'}</small></div><span className={`provider-dot ${serverConfig?.provider.configured ? 'ready' : ''}`} /></div>
          <form className="auth-form" onSubmit={authenticate}>
            <label htmlFor="operator-token">Operator token</label>
            <div className="token-input"><input id="operator-token" value={tokenDraft} onChange={e => setTokenDraft(e.target.value)} type={showToken ? 'text' : 'password'} placeholder="Enter local access token" autoComplete="off" /><button type="button" className="icon-button tiny" onClick={() => setShowToken(value => !value)} title={showToken ? 'Hide token' : 'Show token'}>{showToken ? <EyeOff size={14} /> : <Eye size={14} />}</button></div>
            {token ? <button type="button" className="text-button" onClick={disconnect}><LockKeyhole size={13} /> Disconnect operator</button> : <button className="connect-button" disabled={working || !tokenDraft}><Shield size={14} /> Connect operator</button>}
          </form>
        </div>
      </aside>

      <main className="main-content">
        {error && <div className="toast error"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError('')}><X size={15} /></button></div>}
        {notice && <div className="toast success"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}
        {!selectedId ? <>
          <div className="page-heading"><div><div className="eyebrow">PLAYTEST WORKSPACE</div><h1>Configure a simulation</h1><p>Set the rules, choose agent behavior, then start a recorded run.</p></div><div className="heading-actions"><button className="button secondary" onClick={() => importRef.current?.click()}><FileUp size={15} /> Import file</button><button className="button secondary" onClick={() => { setError(''); setPasteOpen(true) }}><FileUp size={15} /> Paste JSON</button><button className="button secondary" onClick={exportConfig} disabled={!config}><ArrowDownToLine size={15} /> Export config</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={e => { void importConfig(e.target.files?.[0]); e.currentTarget.value = '' }} /></div></div>
          <div className="setup-layout">
            <section className="config-column">
              <div className="section-heading"><div><h2>Game configuration</h2><p>Every run stores a fixed copy of these values.</p></div><button className="text-button" onClick={resetConfig}><RotateCcw size={14} /> Reset defaults</button></div>
              {configError && <div className="inline-error"><AlertCircle size={15} />{configError}</div>}
              <div className="config-accordion">{configGroups.map(group => {
                const open = expanded === group.id
                return <section className={`config-card ${open ? 'is-open' : ''}`} key={group.id}>
                  <button className="config-card-head" onClick={() => setExpanded(open ? '' : group.id)} aria-expanded={open}><span className="config-card-icon">{group.id === 'bomb' ? '✳' : group.id === 'cave' ? '⌁' : group.id === 'circle' ? '↻' : group.id === 'general' ? '◈' : '◉'}</span><span className="config-title"><strong>{group.title}</strong><small>{group.description}</small></span><ChevronDown className={open ? 'chevron open' : 'chevron'} size={17} /></button>
                  {open && <div className="config-fields">{group.fields.map(field => {
                    const current = config ? getPath(config, field.path) : undefined
                    const isArray = Array.isArray(current)
                    const count = isArray ? current.length : 1
                    const labels = field.path === 'cave.collapseRisk' ? Array.from({ length: count }, (_, index) => `${index} departed`) : rounds
                    return <div className={`field-row ${isArray ? 'array-field' : ''}`} key={field.path}>
                      <div className="field-label"><strong>{field.label}</strong>{field.hint && <small>{field.hint}</small>}</div>
                      <div className="field-inputs">{Array.from({ length: count }, (_, index) => <label className="number-field" key={index}>{isArray && <span>{labels[index]}</span>}<input type="number" min={field.min} max={field.max} step={field.step} value={isArray ? current[index] : current as number} onChange={e => updateConfig(field.path, isArray ? index : null, e.target.value)} aria-label={`${field.label}${isArray ? ` ${labels[index]}` : ''}`} /></label>)}</div>
                    </div>
                  })}</div>}
                </section>
              })}</div>
            </section>

            <aside className="run-setup-column">
              <form className="setup-card" onSubmit={createRun}>
                <div className="setup-card-title"><span className="large-icon"><Bot size={19} /></span><div><h2>Run setup</h2><p>Configure agents and run limits.</p></div></div>
                <div className="form-field"><label htmlFor="run-name">Run name <span>optional</span></label><input id="run-name" value={runName} onChange={e => setRunName(e.target.value)} placeholder="e.g. Baseline · seed 41" /></div>
                <div className="form-field"><label>Agent mode</label><div className="segmented"><button type="button" className={options.mode === 'scripted' ? 'active' : ''} onClick={() => setOptions({ ...options, mode: 'scripted' })}><Activity size={14} /> Scripted</button><button type="button" className={options.mode === 'openai' ? 'active' : ''} onClick={() => setOptions({ ...options, mode: 'openai' })}><WandSparkles size={14} /> OpenAI</button></div></div>
                {isOpenAI && <div className="model-fields"><div className="form-field"><label htmlFor="host-model">Host model</label><input id="host-model" value={options.hostModel} onChange={e => setOptions({ ...options, hostModel: e.target.value })} placeholder="Configured on server" /></div><div className="form-field"><label htmlFor="host-reasoning-effort">Host reasoning effort</label><select id="host-reasoning-effort" value={options.hostReasoningEffort} onChange={e => setOptions({ ...options, hostReasoningEffort: e.target.value as RunOptions['hostReasoningEffort'] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">XHigh</option></select></div><div className="form-field"><label htmlFor="player-model">Player model</label><input id="player-model" value={options.playerModel} onChange={e => setOptions({ ...options, playerModel: e.target.value })} placeholder="Configured on server" /></div><div className="form-field"><label htmlFor="player-reasoning-effort">Player reasoning effort</label><select id="player-reasoning-effort" value={options.playerReasoningEffort} onChange={e => setOptions({ ...options, playerReasoningEffort: e.target.value as RunOptions['playerReasoningEffort'] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">XHigh</option></select></div><div className={`key-status ${serverConfig?.provider.configured ? 'good' : 'bad'}`}><KeyRound size={14} />{serverConfig?.provider.configured ? 'Provider key is configured on the server.' : 'Add an API key to the server environment to use OpenAI mode.'}</div></div>}
                {isOpenAI && <div className="form-field"><div className="two-fields"><NumberSetting label="Host context tokens" value={options.hostContextTokens} min={0} max={10000000} step={1} onChange={value => setOptions({ ...options, hostContextTokens: value })} /><NumberSetting label="Player context tokens" value={options.playerContextTokens} min={0} max={10000000} step={1} onChange={value => setOptions({ ...options, playerContextTokens: value })} /></div><small>0 discovers the limit from provider model metadata. If unavailable, enter the model's documented context window. Full permitted history is retained; a full context pauses the run.</small></div>}
                {isOpenAI && <div className="form-field"><NumberSetting label="Tool call attempts" value={options.maxToolAttempts} min={1} max={10} step={1} onChange={value => setOptions({ ...options, maxToolAttempts: value })} /><small>Includes the first proposal. Validation errors return privately to the model; the run pauses when attempts are exhausted.</small></div>}
                <div className="two-fields"><NumberSetting label="Teams" value={options.teamCount} min={MIN_TEAMS} max={MAX_TEAMS} step={1} onChange={value => setOptions({ ...options, teamCount: value })} /><NumberSetting label="Setup seed" value={options.seed} min={0} max={2147483647} step={1} onChange={value => setOptions({ ...options, seed: value })} /></div>
                <div className="form-subheading"><span>Discussion and cave cadence</span><CircleHelp size={14} aria-label="One sweep gives every team a turn in a fresh shuffled order. Limits apply once between rounds; the host closes after agreement once the minimum is met." /></div>
                <div className="two-fields"><NumberSetting label="Minimum sweeps" value={options.minDiscussionBeats} min={0} max={20} step={1} onChange={value => setOptions({ ...options, minDiscussionBeats: value })} /><NumberSetting label="Maximum sweeps" value={options.maxDiscussionBeats} min={0} max={20} step={1} onChange={value => setOptions({ ...options, maxDiscussionBeats: value })} /></div>
                <p className="discussion-help">One discussion between rounds reviews results and plans the next round. Transfers and reveal contributions are available during discussion. The host may close after the minimum; game choices wait for the round to start.</p>
                <NumberSetting label="Cave sweeps / window" value={options.caveDiscussionBeats} min={0} max={5} step={1} onChange={value => setOptions({ ...options, caveDiscussionBeats: value })} />
                <small>0 disables discussion inside cave decision windows. The normal discussion before a cave round still uses the limits above.</small>
                <div className="form-subheading"><span>Run budgets</span><Clock3 size={14} /></div>
                <NumberSetting label="Step budget" value={options.maxSteps} min={1} max={10000} step={1} onChange={value => setOptions({ ...options, maxSteps: value })} />
                <NumberSetting label="Wall time (minutes)" value={Math.round(options.maxWallTimeMs / 60000)} min={1} max={1440} step={1} onChange={value => setOptions({ ...options, maxWallTimeMs: value * 60000 })} />
                <div className="config-snapshot"><Shield size={14} /><span>Players use the shared game engine and their own filtered views.</span></div>
                <button className="button primary start-button" disabled={!token || !config || !!configError || working || (isOpenAI && !serverConfig?.provider.configured)}><CirclePlay size={17} />{working ? 'Starting…' : 'Start simulation'}</button>
                {optionsError && <div className="inline-error setup-validation"><AlertCircle size={14} />{optionsError}</div>}
                {!token && <small className="start-help">Connect operator access to create a run.</small>}
              </form>
            </aside>
          </div>
        </> : <>
          <div className="page-heading run-heading"><div><div className="eyebrow">SIMULATION RUN</div><h1>{selectedSummary?.name || `Simulation ${selectedId.slice(0, 8)}`}</h1><p>{selectedSummary?.options?.mode || 'run'} mode · {selectedSummary?.options?.teamCount ?? '—'} teams · seed {selectedSummary?.options?.seed ?? '—'} · started {prettyTime(selectedSummary?.createdAt)}</p></div><div className="heading-actions"><button className="button secondary" onClick={exportReplay}><ArrowDownToLine size={15} /> Export replay</button><button className="button secondary" onClick={() => { setSelectedId(''); setDetail(null) }}><Plus size={15} /> New run</button></div></div>
          {observerView && <TeamAccounts teams={accountTeams} finished={selectedSummary?.status === 'finished'} />}
          <section className="run-overview">
            <div className="run-status"><span className={`status-pill ${statusTone(selectedSummary?.status)}`}><i />{selectedSummary?.status || 'loading'}</span><span className="overview-divider" /><span className="progress-caption">{observerView ? <>Step {visibleStepCount} <span>of {selectedSummary?.options?.maxSteps ?? '—'}</span></> : 'Progress hidden in this view'}</span>{observerView && <><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><span className="progress-number">{progress}%</span></>}</div>
            <div className="run-metrics"><Metric label="Visible agents" value={String(visibleAgentCount || '—')} /><Metric label="Tokens used" value={visibleTokenCount === undefined ? '—' : visibleTokenCount.toLocaleString()} />{observerView && <Metric label="Model cost so far" value={formatRunCost(selectedSummary?.modelUsage)} />}<Metric label="Visible events" value={String(visibleEventCount)} /><Metric label="Updated" value={prettyTime(selectedSummary?.updatedAt)} /></div>
            {observerView && Object.keys(selectedSummary?.modelUsage || {}).length > 0 && <details className="model-usage"><summary>Host and player token usage and cost</summary><div className="model-usage-scroll"><table><thead><tr><th>Agent / model</th><th>Responses</th><th>Input total</th><th>Output total</th><th>Total usage</th><th>Cost so far</th><th>Latest input</th><th>Context window</th></tr></thead><tbody>{Object.entries(selectedSummary?.modelUsage || {}).map(([id, usage]) => <tr key={id}><td>{id === 'host' ? 'Host' : selectedSummary?.agents.find(agent => agent.id === id)?.name || id}<small>{usage.model}</small></td><td>{usage.calls}</td><td>{usageTotal(usage.promptTokens, usage.promptUsageCalls, usage.calls)}</td><td>{usageTotal(usage.completionTokens, usage.completionUsageCalls, usage.calls)}</td><td>{usage.totalTokens.toLocaleString()}</td><td>{formatModelCost(usage)}<small>{usage.promptPriceUsdPerToken !== undefined && usage.completionPriceUsdPerToken !== undefined ? `Rates: $${(usage.promptPriceUsdPerToken * 1e6).toPrecision(4)} / $${(usage.completionPriceUsdPerToken * 1e6).toPrecision(4)} per 1M input/output tokens` : 'No published rates available'}</small></td><td>{usage.lastPromptTokens === undefined ? '~' : ''}{(usage.lastPromptTokens ?? usage.lastEstimatedPromptTokens)?.toLocaleString() || '—'}<small>+{usage.reservedOutputTokens?.toLocaleString() || '—'} reserved output</small></td><td>{usage.contextWindowTokens?.toLocaleString() || 'Unknown'}<small>{usage.contextSource || 'not resolved'}</small></td></tr>)}</tbody></table></div><small>Reported OpenRouter cost is used when returned. Otherwise cost uses the model catalogue input/output rates and reported token counts; it may differ when caching, provider routing, or special token types change billing. Cumulative usage counts repeated prompts. Context applies to the latest input plus output allowance, not lifetime usage. ~ indicates an estimate; ≥ is partial historical usage; — means unavailable.</small></details>}
            <div className="control-bar"><div className="control-buttons">{selectedSummary?.status === 'running' ? <button className="button secondary" disabled={working} onClick={() => void control('pause')}><Pause size={14} /> Pause</button> : <button className="button secondary" disabled={working || ['finished', 'stopped', 'failed'].includes(selectedSummary?.status || '')} onClick={() => void control('resume')}><Play size={14} /> Resume</button>}<button className="button secondary" disabled={working || selectedSummary?.status !== 'paused'} onClick={() => void control('step')}><SkipForward size={15} /> Step once</button><button className="button danger" disabled={working || ['finished', 'stopped', 'failed'].includes(selectedSummary?.status || '')} onClick={() => void control('stop')}><Square size={13} /> Stop</button></div><span className="run-revision">Revision {selectedSummary?.revision ?? '—'}</span></div>
          </section>
          {selectedSummary?.error && <div className="run-error"><AlertCircle size={16} /><div><strong>{selectedSummary.errorCode?.startsWith("MODEL_CONTEXT") ? "Model context limit" : selectedSummary.errorCode?.startsWith('MODEL_OUTPUT_LIMIT') ? 'Model output limit' : 'Run error'}</strong><p>{selectedSummary.error}</p>{observerView && selectedSummary.errorDetails && <details><summary>Error details</summary><pre>{displayValue(selectedSummary.errorDetails)}</pre></details>}</div></div>}

          <div className="run-tabs"><button className={activePane === 'conversation' ? 'active' : ''} onClick={() => setActivePane('conversation')}><MessageSquareText size={15} /> Room conversation <span>{conversationCount}</span></button><button className={activePane === 'inspector' ? 'active' : ''} onClick={() => setActivePane('inspector')}><Eye size={15} /> State inspector</button><div className="audience-select"><label htmlFor="audience">View</label><select id="audience" value={audience} onChange={e => setAudience(e.target.value)}><option value="observer">Observer audit</option><option value="public">Public view</option>{audienceAgents.map(agent => <option key={agent.id} value={agent.id}>Team · {agent.name}</option>)}</select></div><button className="icon-button" title="Refresh current view" onClick={() => { void loadDetail(); void loadRuns() }}><RotateCcw size={15} /></button></div>
          {activePane === 'conversation' ? <section className="timeline-panel">
            <div className="timeline-head"><div><span className="live-mark"><Radio size={14} /></span><div><strong>{audience === 'observer' ? 'Observer transcript' : audience === 'public' ? 'Public room transcript' : `Private view · ${currentAgent?.agent.name || 'selected team'}`}</strong><small>{audience === 'observer' ? 'Discussion · decisions · results · private chats' : 'Filtered by the runner for this audience'}</small></div></div><span className="timeline-count">{conversationCount} events</span></div>
            {audience !== 'observer' && <div className="privacy-note"><Shield size={14} /> This view and export are requested from the server with the selected audience.</div>}
            <div className="timeline-scroll">{observerView ? observerItems.length ? observerItems.map(item => item.activity ? <ActivityCard key={item.id} activity={item.activity} teams={accountTeams} /> : <EventRow key={item.id} event={item.event!} />) : <div className="empty-state"><MessageSquareText size={24} /><strong>No activity yet</strong><span>Discussion and game events will appear together here.</span></div> : conversationEvents.length ? conversationEvents.map(event => <EventRow key={event.id || event.sequence} event={event} />) : <div className="empty-state"><MessageSquareText size={24} /><strong>No conversation yet</strong></div>}</div>
            <div className="timeline-footer"><span><i className="dot-public" /> {observerView ? 'Discussion, decisions, outcomes & private chats' : audience === 'public' ? 'Public room activity' : 'Public and own private activity'}</span><span>Updated {prettyTime(selectedSummary?.updatedAt)}</span></div>
          </section> : <section className="inspector-layout">
            <div className="inspector-card"><div className="inspector-card-head"><div><span className="large-icon"><Eye size={17} /></span><div><h3>{audience === 'observer' ? 'Observer audit' : audience === 'public' ? 'Public state' : `Team view · ${currentAgent?.agent.name || ''}`}</h3><p>{audience === 'observer' ? 'Privileged run state returned by the runner.' : 'Team scoped details returned by the runner.'}</p></div></div></div>
              <div className="inspector-content">{audience !== 'observer' && audience !== 'public' && currentAgent?.view !== undefined ? <pre>{displayValue(currentAgent.view)}</pre> : <div className="summary-facts"><Fact label="Run status" value={selectedSummary?.status || '—'} /><Fact label="Session" value={selectedSummary?.sessionId || '—'} /><Fact label="Simulation steps" value={visibleStepCount === undefined ? '—' : String(visibleStepCount)} /><Fact label="Visible events" value={String(visibleEventCount)} /><Fact label="Seed" value={String(selectedSummary?.options?.seed ?? '—')} /><Fact label="Mode" value={selectedSummary?.options?.mode || '—'} /></div>}</div>
            </div>
            <div className="inspector-card"><div className="inspector-card-head"><div><span className="large-icon purple"><MessageSquareText size={17} /></span><div><h3>{audience === 'observer' ? 'Recent activity' : 'Private team activity'}</h3><p>{audience === 'observer' ? 'Choices, results, and conversation.' : 'Only events available to the selected agent.'}</p></div></div></div><div className="private-event-list">{audience === 'observer' ? observerItems.slice(-12).reverse().map(item => item.activity ? <ActivityCard key={item.id} activity={item.activity} teams={accountTeams} /> : <EventRow compact key={item.id} event={item.event!} />) : (currentAgent?.privateEvents || []).slice(-12).reverse().map(event => <EventRow compact key={event.id || event.sequence} event={event} />)}{audience !== 'observer' && !(currentAgent?.privateEvents?.length) && <p className="muted-center">No private activity for this team yet.</p>}</div></div>
            {audience === 'observer' && <div className="inspector-card agent-roster"><div className="inspector-card-head"><div><span className="large-icon green"><Bot size={17} /></span><div><h3>Agent roster</h3><p>Run identities without credentials.</p></div></div></div>{agents.length ? agents.map(({ agent }) => <button key={agent.id} className="agent-row" onClick={() => { setAudience(agent.id); setActivePane('inspector') }}><span className="avatar">{agent.name.slice(0, 1).toUpperCase()}</span><span><strong>{agent.name}</strong><small>Team {agent.teamId.slice(0, 8)}</small></span><ChevronDown size={14} /></button>) : <p className="muted-center">Agent details appear when the run is initialized.</p>}</div>}
          </section>}
        </>}
        <footer className="footer"><span>Game Theory Night 2</span><span>Rules and outcomes use the shared game engine</span></footer>
      </main>
    </div>
    {pasteOpen && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPasteOpen(false) }}><section className="paste-modal" role="dialog" aria-modal="true" aria-labelledby="paste-config-title"><div className="paste-modal-head"><div><h2 id="paste-config-title">Paste configuration JSON</h2><p>Paste a game config object. It will be validated before it replaces the current settings.</p></div><button className="icon-button" aria-label="Close import dialog" onClick={() => setPasteOpen(false)}><X size={16} /></button></div><textarea aria-label="Configuration JSON" value={pastedConfig} onChange={event => setPastedConfig(event.target.value)} placeholder="{\n  &quot;initialBalance&quot;: ...\n}" spellCheck={false} /><div className="paste-modal-actions"><button className="button secondary" onClick={() => setPasteOpen(false)}>Cancel</button><button className="button primary" disabled={!pastedConfig.trim()} onClick={() => applyImportedConfig(pastedConfig)}>Import configuration</button></div></section></div>}
  </div>
}

function NumberSetting({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="setting-number"><span>{label}</span><input type="number" min={min} max={max} step={step} value={value} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n) }} /></label>
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div> }
function Fact({ label, value }: { label: string; value: string }) { return <div className="fact"><span>{label}</span><strong>{value}</strong></div> }
function EventRow({ event, compact = false }: { event: RunEvent; compact?: boolean }) {
  const label = event.type.replaceAll(/[._]/g, ' ')
  const isPrivate = event.type === 'chat.private-message'
  const isRules = event.type === 'rules.card' || event.type === 'host.briefing'
  const discussionStage = event.data?.discussionStage
  const stageLabel = discussionStage === 'pre-round' ? 'Round discussion' : discussionStage === 'post-round' ? 'After round' : discussionStage === 'cave-discussion' ? 'Cave window' : undefined
  const speaker = String(event.data?.speakerName || (isPrivate ? event.data?.senderName : undefined) || (event.type.startsWith('host.') || isRules ? 'Host' : '') || label)
  return <article className={`event-row message-row ${compact ? 'compact' : ''} ${isPrivate ? 'private-message' : ''}`}>
    <div className="message-avatar">{isPrivate ? <LockKeyhole size={14} /> : speaker === 'Host' ? <Bot size={15} /> : speaker.slice(0, 1).toUpperCase()}</div>
    <div className="event-body"><div className="event-meta"><strong>{speaker}</strong>{isPrivate && <span className="private-recipient">→ {String(event.data?.recipientName || event.data?.recipientId || 'Private room')}</span>}{event.game && <GameContext game={event.game} round={event.round} />}<time>{prettyTime(event.wallTime)}</time></div>
      {stageLabel && <span className="discussion-phase">{stageLabel}</span>}
      {isRules ? <details className="message-rules"><summary>{event.type === 'host.briefing' ? 'Game theory & cooperation briefing' : 'Game rules'}</summary><p>{eventText(event)}</p></details> : <p>{eventText(event)}</p>}
      {(event.type.startsWith('model.') || event.type === 'discussion.order-reviewed') && event.data && <details className="event-details"><summary>{event.type === 'discussion.order-reviewed' ? 'Order and swaps' : 'Diagnostic details'}</summary><pre>{displayValue(event.data)}</pre></details>}
    </div>
  </article>
}
function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
  URL.revokeObjectURL(url)
}

export default App
