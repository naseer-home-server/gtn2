import type { GameConfig } from 'backend/game'
import { Frame } from './game-slide-frame'
import './cave-instruction-slides.css'

const money = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const grow = (value: number, multiplier: number) => Math.round(value * multiplier * 100) / 100

function Miner({ x, y = 108, pale = false }: { x: number; y?: number; pale?: boolean }) {
  return <g transform={`translate(${x} ${y})`} className="cave-miner">
    <path d="m-7-19-4 17m18-17L11-2" fill="none" stroke="#e9e0d3" strokeWidth="4" strokeLinecap="round"/>
    <path d="M-8-33h16l3 17h-22Z" fill={pale ? '#ece2cf' : '#b80712'} stroke="#211f1c" strokeWidth="1.5"/>
    <path d="m-10-28-7 13m27-13 7 13" fill="none" stroke={pale ? '#ece2cf' : '#b80712'} strokeWidth="4" strokeLinecap="round"/>
    <circle cy="-43" r="8" fill="#fff8eb" stroke="#211f1c" strokeWidth="1.5"/>
    <path d="M-10-44c0-14 20-14 20 0Z" fill="#e7b95e" stroke="#211f1c" strokeWidth="1.5"/>
    <path d="M-12-44h24" stroke="#211f1c" strokeWidth="2" strokeLinecap="round"/>
    <circle cy="-48" r="3" fill="#fff8eb"/>
  </g>
}

function TunnelStrip({ depth = 0, outside = false }: { depth?: number; outside?: boolean }) {
  return <svg viewBox="0 0 800 125" aria-hidden="true" className="cave-tunnel-strip">
    <path d="M100 115V43l26-26 83 5 90-9 95 10 94-8 98 10 99-8 115 8v90Z" fill="#d9d0c1"/>
    <path d="M133 115V62l24-19 67 4 76-10 97 10 95-8 95 10 98-8 115 8v66Z" fill="#393733"/>
    <path d="m110 47 17-20 25 9m139-12 17 15 21-10m203-6 26 13 22-9m116-2 33 14" fill="none" stroke="#b5aa98" strokeWidth="2"/>
    <path d="M10 116h790" stroke="#b7ab99" strokeWidth="3"/>
    <g className="cave-expedition">{Array.from({ length: outside ? 3 : 7 }, (_, i) => <Miner key={i} x={(outside ? 29 : 164 + depth * 174) + i * 25} pale={i % 2 === 1}/>)}</g>
    {outside ? <path d="M100 42H15m15-10L15 42l15 10" fill="none" stroke="#b80712" strokeWidth="3"/> : <path d={`M${345 + depth * 174} 88h44l-10-8m10 8-10 8`} fill="none" stroke="#e7b95e" strokeWidth="2"/>}
  </svg>
}

export function CaveGrowthSlide({ config, step }: { config: GameConfig; step: number }) {
  const c = config.cave, count = Math.min(3, c.maxTicks)
  const amounts = [c.startingMoney[0]]
  for (let i = 1; i < count; i++) amounts.push(grow(amounts[i - 1], c.growth[0]))
  return <Frame game="cave" label="tick-by-tick" className="cave-growth-slide">
    <div className="cave-tick-intro"><p>Deeper each tick. A bigger haul.</p><strong>{c.tickSeconds}s <span>per tick</span></strong></div>
    <div className="cave-growth-grid">
      <div className="cave-growth-columns"><span/><span>Further into the cave →</span><span>Per team</span></div>
      {amounts.map((amount, i) => <section key={i} className={`cave-growth-row${step >= i ? ' is-visible' : ''}`} aria-hidden={step < i} aria-label={`Tick ${i + 1}, ${c.tickSeconds} seconds, ${money(amount)} unbanked per team`}>
        <div className="cave-tick-label"><h2>Tick {i + 1}</h2><span>{c.tickSeconds} seconds</span></div>
        <TunnelStrip depth={i}/>
        <div className="cave-tick-money">{i > 0 && <small>×{c.growth[0]}</small>}<strong>{money(amount)}</strong><span>unbanked</span></div>
      </section>)}
    </div>
    <p className="cave-instruction-note">Tick 1 opens safely. Later growth only happens if the cave survives.</p>
  </Frame>
}

export function CaveDecisionSlide({ config }: { config: GameConfig }) {
  const c = config.cave, tick = Math.min(2, c.maxTicks)
  const current = tick === 1 ? c.startingMoney[0] : grow(c.startingMoney[0], c.growth[0])
  const next = grow(current, c.growth[0])
  return <Frame game="cave" label="stay or leave" heading="Every tick: stay or leave">
    <p className="cave-decision-example">Example: Tick {tick} · {money(current)} available per team · {c.tickSeconds}s to choose</p>
    <div className="cave-decisions-grid">
      <section className="cave-stay-option"><h2>Stay</h2><p>Keep your haul in the cave.</p><TunnelStrip depth={1}/><div className="cave-option-money"><span>{money(current)}</span><i aria-hidden="true">→</i><strong>{money(tick === c.maxTicks ? current : next)}</strong></div><small>{tick === c.maxTicks ? 'Final tick: automatically banked' : `Next tick, if the cave survives · ×${c.growth[0]}`}</small></section>
      <section className="cave-leave-option"><h2>Leave</h2><p>Bank this tick’s amount immediately.</p><TunnelStrip outside/><div className="cave-option-money"><strong>{money(current)}</strong><span className="cave-banked-label">Banked ✓</span></div><small>Safe, even if the cave later collapses.</small></section>
    </div>
    <p className="cave-instruction-note">No response = stay. Tick {c.maxTicks}: everyone still inside banks automatically.</p>
  </Frame>
}

function CollapseScene() {
  return <svg viewBox="0 0 720 330" className="cave-collapse-scene" role="img" aria-label="Falling rocks collapse the cave around the teams still inside. Teams that already left remain safe outside.">
    <path d="M165 301V114l42-71 105-18 95 15 90-18 101 27 93-6 29 22v236Z" fill="#d9d0c1"/>
    <path d="M205 301V137l39-57 69-15 95 15 90-18 96 27 90-6 36 22v196Z" fill="#393733"/>
    <path d="m177 119 41-64 46 3m75-23 36 26 42-11m99-16 38 26 30-5" fill="none" stroke="#b5aa98" strokeWidth="3"/>
    <path d="M13 305h707" stroke="#b7ab99" strokeWidth="4"/>
    <Miner x={60} y={298}/><Miner x={103} y={298} pale/>
    <g className="cave-trapped-miners"><Miner x={355} y={298}/><Miner x={401} y={298} pale/><Miner x={493} y={298}/><Miner x={540} y={298} pale/></g>
    <g className="cave-collapse-dust"><ellipse cx="455" cy="294" rx="155" ry="19" fill="#d9d0c1" opacity=".3"/></g>
    <g className="cave-falling-rocks" fill="#aa9f8c" stroke="#292621" strokeWidth="2">
      <path d="m294 95 39-23 31 25-10 35-43 4Z"/><path d="m387 64 36-19 39 30-15 32-36-4Z"/><path d="m493 99 27-35 36 22 13 30-46 18Z"/><path d="m587 72 40-14 22 35-21 30-37-10Z"/>
    </g>
    <path className="cave-roof-crack" d="m435 38-16 39 20 17-17 37" fill="none" stroke="#b80712" strokeWidth="4" strokeLinejoin="round"/>
    <text x="82" y="225" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="23" fill="#70695f">Safe outside</text>
  </svg>
}

export function CaveCollapseSlide({ config }: { config: GameConfig }) {
  const c = config.cave
  return <Frame game="cave" label="collapse risk" heading="If the cave collapses…">
    <div className="cave-collapse-layout">
      <section className="cave-collapse-outcome"><CollapseScene/><h2>Still inside <span aria-hidden="true">→</span> <strong>$0</strong></h2><p>No earnings this round.<br/>Banked money stays safe.</p></section>
      <section className="cave-risk-table-section"><h2>More teams out. More risk.</h2><table className="cave-risk-table"><thead><tr><th scope="col">Teams already out</th><th scope="col">Collapse chance</th></tr></thead><tbody>{c.collapseRisk.map((risk, i) => <tr key={i}><th scope="row">{i}{i === 4 && c.collapseRisk.length === 5 ? '+' : ''}</th><td>{risk}%</td></tr>)}</tbody></table><p>Checked after each tick.<br/>Final tick banks everyone, with no check.</p></section>
    </div>
    <p className="cave-instruction-note">Illustrative teams · Other teams’ decisions stay hidden during play.</p>
  </Frame>
}
