import type { GameConfig } from 'backend/game'
import { Frame } from './game-slide-frame'
import './bomb-instruction-slides.css'

function BombIcon({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 120 120" className={className} aria-hidden="true"><path d="m74 28 11-15q8-10 13 0" fill="none" stroke="#70695f" strokeWidth="5" strokeLinecap="round"/><path d="m96 3 1 9m10-5-7 7m11 8-10-3" fill="none" stroke="#b80712" strokeWidth="3" strokeLinecap="round"/><path d="m65 22 20 11-9 17-20-12Z" fill="#292621"/><circle cx="53" cy="73" r="39" fill="#292621"/><path d="M28 69a26 26 0 0 1 22-21" fill="none" stroke="#f4f0e8" strokeWidth="5" strokeLinecap="round"/></svg>
}
function TeamPair() {
  return <svg viewBox="0 0 100 90" className="bomb-team-pair" aria-hidden="true"><circle cx="31" cy="22" r="12" fill="#fffcf7" stroke="#292621" strokeWidth="2"/><circle cx="69" cy="22" r="12" fill="#fffcf7" stroke="#292621" strokeWidth="2"/><path d="M11 78V58c0-22 40-22 40 0v20" fill="#b80712" stroke="#292621" strokeWidth="2"/><path d="M49 78V58c0-22 40-22 40 0v20" fill="#e8e0d4" stroke="#292621" strokeWidth="2"/></svg>
}
export function BombRecipientSlide() {
  return <Frame game="bomb" label="bomb recipient">
    <h2 className="bomb-recipient-heading">One team gets the bomb.</h2>
    <div className="bomb-recipient-stage" role="img" aria-label="A bomb flies to Team 4 among seven fictional teams. Any team can receive it.">
      <BombIcon className="bomb-in-flight"/>
      <div className="bomb-seven-teams">{Array.from({length:7},(_,i)=><div className={`bomb-example-team${i === 3 ? ' is-target' : ''}`} key={i}><TeamPair/><p>Team {i + 1}</p></div>)}</div>
    </div>
    <p className="bomb-instruction-foot">Any team can receive it. Everyone sees who.</p>
  </Frame>
}
const money = (value: number) => `$${value.toLocaleString('en-US', {maximumFractionDigits:2})}`
export function BombBalanceSlide({ config }: { config: GameConfig }) {
  const factor = config.bomb.factor[0], balance = 1000
  return <Frame game="bomb" label="multiply or divide">
    <div className="bomb-balance-layout">
      <div className="bomb-starting-balance"><span>Team 4’s entire money balance</span><strong>{money(balance)}</strong></div>
      <svg className="bomb-balance-branches" viewBox="0 0 700 70" aria-hidden="true"><path d="M350 0v23H100v37m250-37h250v37M91 50l9 10 9-10m482 0 9 10 9-10" fill="none" stroke="#b7ab99" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <div className="bomb-balance-outcomes"><section><h2>Up <span>×{factor}</span></h2><strong>{money(balance * factor)}</strong></section><section><h2>Down <span>÷{factor}</span></h2><strong>{money(Math.round(balance / factor * 100) / 100)}</strong></section></div>
    </div>
    <p className="bomb-instruction-foot">Round 1 · Fictional balance · Only the recipient sees up or down.</p>
  </Frame>
}
function ChitBucket({ recipient, drawn, factor }: { recipient: boolean; drawn: boolean; factor: number }) {
  const tickets = recipient ? ['Team 1','Team 4','Team 7','Team 2','Team 4','Team 5','Team 3'] : ['↑','↓','↑','↑','↓','↑','↓']
  const positions = [[117,148,-18],[197,141,8],[270,148,20],[153,190,12],[230,188,-14],[103,226,-7],[287,226,14]]
  return <svg className={`bomb-chit-bucket${drawn ? ' is-drawn' : ''}`} viewBox="0 0 440 315" role="img" aria-label={`${recipient ? 'Recipient bucket with team-name chits' : 'Direction bucket with up and down chits'}.${drawn ? recipient ? ' Team 4 is drawn.' : ` Up is drawn: multiply by ${factor}.` : ''}`}>
    <path d="M65 128q155 50 310 0l-31 154q-124 47-248 0Z" fill="#e8e0d4" stroke="#393733" strokeWidth="2.5"/>
    <ellipse cx="220" cy="128" rx="155" ry="35" fill="#d2c6b5" stroke="#393733" strokeWidth="2.5"/>
    {tickets.map((ticket,i)=><g transform={`translate(${positions[i][0]} ${positions[i][1]}) rotate(${positions[i][2]})`} key={i}><rect x="-35" y="-17" width="70" height="34" rx="4" fill="#fffcf7" stroke="#a89b87" strokeWidth="1.5"/><text y="6" textAnchor="middle" fontFamily="var(--font-sans)" fontSize={recipient ? 17 : 25} fill="#393733">{ticket}</text></g>)}
    <path d="M65 128q155 50 310 0l-31 154q-124 47-248 0Z" fill="#e8e0d4" fillOpacity=".28" stroke="#393733" strokeWidth="2.5"/>
    <text x="220" y="278" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="21" fill="#393733">{recipient ? 'Recipient' : 'Direction'}</text>
    {drawn && <g className="bomb-drawn-chit"><path d="M220 99V70m-8 9 8-9 8 9" fill="none" stroke="#b80712" strokeWidth="2.5"/><rect x="159" y="7" width="122" height="54" rx="7" fill="#b80712"/><text x="220" y="42" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="26" fill="#fffcf7">{recipient ? 'Team 4' : `↑ ×${factor}`}</text></g>}
  </svg>
}
export function BombBucketsSlide({ config, step }: { config: GameConfig; step: number }) {
  const c = config.bomb, drawn = step >= 1
  return <Frame game="bomb" label="two chit buckets" heading="Two buckets decide">
    <p className="bomb-bucket-intro">Every team adds chits to both. Draw one from each.</p>
    <div className="bomb-buckets-grid"><section><h2>Who gets it?</h2><ChitBucket recipient drawn={drawn} factor={c.factor[0]}/></section><section><h2>Multiply or divide?</h2><ChitBucket recipient={false} drawn={drawn} factor={c.factor[0]}/></section></div>
    <div className="bomb-draw-outcome" aria-hidden={!drawn}>{drawn && <><BombIcon/><span>Team 4</span><b>×{c.factor[0]}</b></>}</div>
    <p className="bomb-bucket-limits">Each team: {c.minChits}–{c.maxChits} chits per bucket. Most stars: up to {c.advantageChits}.<small>Your two totals can differ. Allocations stay private.</small></p>
  </Frame>
}
