import { circleChains, currentCircleStarts, normalizeCircleSelection } from './circle-chain-model'
import { useId, useState } from 'react'
import type { EngineState, SessionEventView, Transfer } from 'backend/game'
import { formatMoney, moneyUnits } from '@/lib/game-display'

function links(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).every(x => typeof x === 'string')) return null
  return value as Record<string, string>
}
function amount(value: unknown): { money: string; stars: number } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const x = value as { money?: unknown; stars?: unknown }
  return typeof x.money === 'string' && typeof x.stars === 'number' ? { money: x.money, stars: x.stars } : undefined
}
const receipt = (value?: { money: string; stars: number }) => value ? `${formatMoney(value.money)} · ${value.stars} stars` : 'Pending'
const currentReceipt = (value?: Transfer) => value ? { money: moneyUnits(BigInt(value.money)), stars: value.stars } : undefined

export function CircleChains({ state, events }: { state: EngineState; events: SessionEventView[] }) {
  const [selected, setSelected] = useState('latest')
  const markerId = `circle-arrow-${useId().replace(/:/g, '')}`
  const starts = currentCircleStarts(events)
  const selectedStart = normalizeCircleSelection(selected, starts)
  const latest = starts.at(-1)
  const event = selectedStart === 'latest' ? latest : starts.find(item => item.id === selectedStart) ?? latest
  const current = state.current.game === 'circle' && state.current.phase !== 'ready' && event?.id === latest?.id && Number(event?.data.round) === state.round
    ? state.current : null
  const next = current?.next ?? links(event?.data.next)
  if (!next) return <section className="admin-tool"><h2 className="section-heading">Circle chains</h2><p className="mt-3 text-sm text-muted-foreground">The actual chains appear when the host starts the circle game.</p></section>
  let chains: string[][]
  try { chains = circleChains(next, state.teams.map(team => team.id)) }
  catch { return <p role="alert">The recorded circle links could not be displayed.</p> }
  const round = current ? state.round : Number(event?.data.round ?? 1)
  // Match outcomes to this recorded start, including rounds later undone by reset.
  const startIndex = event ? events.findIndex(item => item.id === event.id) : -1
  const following = events.slice(startIndex + 1)
  const nextBoundary = following.findIndex(item => item.type === 'circle.started' || item.type === 'game.reset')
  const recorded = nextBoundary < 0 ? following : following.slice(0, nextBoundary)
  const outcome = recorded.find(item => item.type === 'round.completed' && item.data.game === 'circle' && Number(item.data.round) === round)
  const flow = outcome?.data.transfers as Record<string, { sent?: unknown; received?: unknown; returned?: unknown }> | undefined
  const name = (id: string) => state.teams.find(team => team.id === id)?.name ?? id
  return <section className="admin-tool circle-chains" aria-label="Actual circle chains">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="section-heading">Circle chains</h2><p className="mt-2 text-sm text-muted-foreground">Arrows show where each team sends. Returns travel back to the sender.</p></div><label className="space-y-1 text-sm"><span className="block">Round to inspect</span><select className="h-11 rounded-lg border bg-card px-3" value={selectedStart} onChange={e => setSelected(e.target.value)}><option value="latest">Latest round</option>{starts.map(item => <option key={item.id} value={item.id}>Round {String(item.data.round)}</option>)}</select></label></div>
    <p className="mt-4 text-sm font-medium">Round {round}{current ? ` · ${current.phase === 'transfer' ? 'Sending' : current.phase === 'return' ? 'Returning' : 'Complete'}` : ' · Recorded chains'} · Host view only</p>
    <div className="circle-grid">{chains.map((chain, ci) => {
      const points = chain.map((_, i) => {
        const angle = chain.length === 2 ? i * Math.PI : -Math.PI / 2 + i * Math.PI * 2 / chain.length
        return { x: 250 + 164 * Math.cos(angle), y: 220 + 144 * Math.sin(angle) }
      })
      return <article className="circle-group" key={chain.join('|')}><h3 className="font-medium">Circle {ci + 1} · {chain.length} teams</h3>
        <div className="circle-diagram-scroll"><svg viewBox={chain.length === 2 ? "0 130 500 180" : "0 0 500 440"} role="img" aria-label={`Circle ${ci + 1}: ${chain.map(name).join(' sends to ')}, closes at ${name(chain[0])}`}>
          <defs><marker id={`${markerId}-${ci}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" /></marker></defs>
          {chain.map((id, i) => {
            const a = points[i], b = points[(i + 1) % points.length]
            const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy)
            const x1 = a.x + dx / distance * 58, y1 = a.y + dy / distance * 33
            const x2 = b.x - dx / distance * 62, y2 = b.y - dy / distance * 36
            const bend = chain.length === 2 ? 48 : 10
            return <path key={id} d={`M${x1},${y1} Q${(a.x+b.x)/2-dy/distance*bend},${(a.y+b.y)/2+dx/distance*bend} ${x2},${y2}`} fill="none" stroke="currentColor" strokeWidth="2" markerEnd={`url(#${markerId}-${ci})`} />
          })}
          {chain.map((id, i) => <g key={id}><rect x={points[i].x - 66} y={points[i].y - 29} width="132" height="58" rx="12" fill="var(--card)" stroke="var(--border)" /><foreignObject x={points[i].x - 59} y={points[i].y - 25} width="118" height="50"><div className="circle-node-name">{name(id)}</div></foreignObject></g>)}
        </svg></div>
        <p className="circle-text-chain">{[...chain, chain[0]].map(name).join(' → ')}</p>
        <div className="overflow-auto"><table className="circle-receipts"><caption className="sr-only">Sent, received, and returned amounts for circle {ci + 1}</caption><thead><tr><th>Team</th><th>Sent</th><th>Received after multiplier</th><th>Returned to sender</th></tr></thead><tbody>{chain.map(id => <tr key={id}><th scope="row">{name(id)}</th><td>{receipt(current ? currentReceipt(current.transfers[id]) : amount(flow?.[id]?.sent))}</td><td>{receipt(current ? currentReceipt(current.received[id]) : amount(flow?.[id]?.received))}</td><td>{receipt(current ? currentReceipt(current.returns[id]) : amount(flow?.[id]?.returned))}</td></tr>)}</tbody></table></div>
      </article>
    })}</div>
  </section>
}
