import { useState, type ReactNode } from 'react'
import type { GameConfig, GameId } from 'backend/game'
import { Frame } from './game-slide-frame'
import { BombRecipientSlide } from './bomb-instruction-slides'
import { CircleFlowDiagram } from './circle-flow-diagram'
import { CaveGrowthSlide } from './cave-instruction-slides'


function RuleText({ children }: { children: ReactNode }) { return <p className="game-rule-text">{children}</p> }

function DemoCounter({ label, value, onChange, max, id }: { label: string; value: string; onChange: (value: string) => void; max: number; id: string }) {
  const count = Number(value) || 0
  return <div className="demo-counter"><span>{label}</span><div><button type="button" aria-label={`Decrease ${label}`} disabled={count <= 0} onClick={() => onChange(String(Math.max(0, count - 1)))}>−</button><input id={id} aria-label={label} inputMode="numeric" value={value} onChange={e => onChange(e.target.value)} /><button type="button" aria-label={`Increase ${label}`} disabled={count >= max} onClick={() => onChange(String(Math.min(max, count + 1)))}>+</button></div></div>
}

function TeamMoneyBag() {
  return <svg viewBox="0 0 160 190" aria-hidden="true" className="bonus-team-scene">
    <circle cx="49" cy="31" r="12" fill="#fffcf7" stroke="#292621" strokeWidth="2"/>
    <circle cx="111" cy="31" r="12" fill="#fffcf7" stroke="#292621" strokeWidth="2"/>
    <path d="M25 103V75c0-16 10-26 24-26s24 10 24 26v28" fill="#b80712" stroke="#292621" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M87 103V75c0-16 10-26 24-26s24 10 24 26v28" fill="#e8e0d4" stroke="#292621" strokeWidth="2" strokeLinejoin="round"/>
    <path d="m33 77-2 27m96-27 2 27" fill="none" stroke="#292621" strokeWidth="2" strokeLinecap="round"/>
    <path d="m65 87-12-22q27 10 54 0L95 87c12 13 30 34 30 58 0 20-17 27-45 27s-45-7-45-27c0-24 18-45 30-58Z" fill="#e8dcc7" stroke="#292621" strokeWidth="2.2" strokeLinejoin="round"/>
    <path d="M62 87h36m-33 5h30m3-4 13 8m-46-5-13 8" fill="none" stroke="#b80712" strokeWidth="3" strokeLinecap="round"/>
    <path d="M46 140c-2 12 4 19 14 22" fill="none" stroke="#c3af8c" strokeWidth="3" strokeLinecap="round"/>
    <text x="80" y="146" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="36" fill="#292621">$</text>
    <path d="M17 175h126" stroke="#d9d2c7" strokeWidth="2" strokeLinecap="round"/>
  </svg>
}
function TeamChoiceSlide({ game, max, verb }: { game: GameId; max: number; verb: string }) {
  return <Frame game={game} label={game === 'bonus' ? 'take from the bag' : 'choose your amount'} className="bonus-choice-slide">
    <div className="bonus-choice-layout"><h2>{verb} 0–{max}</h2>
      <div className="bonus-team-line" role="img" aria-label={`Seven teams, each with a money bag in front of them. Each team can ${verb.toLowerCase()} zero to ${max}.`}>{Array.from({length:7}, (_, i) => <div className="bonus-team" key={i}><TeamMoneyBag/><p>Team {i + 1}</p></div>)}</div>
    </div>
  </Frame>
}
export function BonusChoiceSlide({ config }: { config: GameConfig }) {
  return <TeamChoiceSlide game="bonus" max={config.bonus.bag[0]} verb="Take"/>
}
export function HighLowExampleSlide({ config, step }: { config: GameConfig; step: number }) {
  const cap = config.highLow.pool[0] * config.highLow.multiplier[0]
  const choices = [.4, .1, .7, .25, 1, .6, .35].map(fraction => Math.round(cap * fraction * 100) / 100)
  const format = (amount: number) => amount.toLocaleString('en-US', { maximumFractionDigits: 2 })
  const payoutsVisible = step >= 2
  return <Frame game="high-low" label="worked example">
    <div className={`highlow-example${step >= 1 ? ' highlow-highlighted' : ''}${payoutsVisible ? ' highlow-paid' : ''}`}>
      <div className="highlow-example-caption"><h2>{payoutsVisible ? 'Lowest gets the highest amount.' : step === 1 ? 'Find the lowest and highest.' : 'Everyone chooses.'}</h2><p>{payoutsVisible ? 'Everyone else gets the lowest.' : 'An example with seven teams'}</p></div>
      <div className="highlow-team-line">{choices.map((choice, i) => {
        const lowest = i === 1, highest = i === 4
        return <section key={i} className={`highlow-team${lowest ? ' is-lowest' : ''}${highest ? ' is-highest' : ''}`} aria-label={`Team ${i + 1}`}>
          <span className="highlow-extreme" aria-hidden={step < 1}>{step >= 1 ? lowest ? 'Lowest' : highest ? 'Highest' : '\u00a0' : '\u00a0'}</span>
          <TeamMoneyBag/><h3>Team {i + 1}</h3>
          <div className="highlow-choice"><small>Chose</small><strong>{format(choice)}</strong></div>
          <div className="highlow-payout" aria-hidden={!payoutsVisible}><span aria-hidden="true">↓</span><small>Gets</small><strong>{format(lowest ? choices[4] : choices[1])}</strong></div>
        </section>
      })}</div>
      <p className="highlow-example-note">Fictional example · Tied lowest? Arrival order decides.</p>
    </div>
  </Frame>
}
export function BonusRulesSlide({ config }: { config: GameConfig }) {
  const threshold = config.bonus.threshold[0]
  return <Frame game="bonus" label="bonus rules" heading="Bonus rules">
    <div className="bonus-payout-rules">
      <section><h2>Collective bonus</h2><p>If the combined take is {threshold} or less, multiply your take:</p><div className="bonus-collective-rounds">{config.bonus.multiplier.map((value, i) => <div key={i}><span>Round {i + 1}</span><strong>×{value}</strong>{config.bonus.threshold[i] !== threshold && <small>Total ≤ {config.bonus.threshold[i]}</small>}</div>)}</div><small>Otherwise, ×1.</small></section>
      <section><h2>Zero-taker bonus</h2><p>Multiply again by the number of teams taking 0.</p><small>If nobody takes 0, use ×1.</small></section>
    </div>
    <p className="bonus-rules-note">Both bonuses apply independently.</p>
  </Frame>
}

export function GameInstructionSlide({ game, step, config }: { game: GameId; step: number; config: GameConfig }) {
  if (game === 'bonus') return <BonusChoiceSlide config={config}/>
  if (game === 'high-low') return <TeamChoiceSlide game="high-low" max={config.highLow.pool[0] * config.highLow.multiplier[0]} verb="Choose"/>
  if (game === 'cave') return <CaveGrowthSlide config={config} step={step}/>
  if (game === 'bomb') return <BombRecipientSlide/>
  const round = 0
  const body = (() => {
    switch (game) {
      case 'circle': return <div className="game-instruction-layout circle-instruction-layout"><CircleFlowDiagram multiplier={config.circle.multiplier[round]} showReturn={step === 2} playerView={step >= 3}/><div className="game-rule-copy">
        {step === 0 && <><h2>A new circle each round.</h2><RuleText>Teams are shuffled into groups of two or more. You send to the next team.</RuleText></>}
        {step === 1 && <><h2>Send money and stars.</h2><RuleText>Choose any amount up to your balance and star balance. Both are multiplied ×{config.circle.multiplier[round]}.</RuleText></>}
        {step === 2 && <><h2>They may return some.</h2><RuleText>Your recipient may send money and stars back, up to their current balances. Returns are not multiplied.</RuleText></>}
        {step >= 3 && <><h2>Some links stay hidden.</h2><RuleText>You see your sender and what arrived. Your recipient and circle are hidden.</RuleText><p className="game-rule-foot">No new stars are awarded in this game.</p></>}
      </div></div>

    }
  })()
  return <Frame game={game} label={`rule ${step + 1}`}>{body}</Frame>
}

export function GameModifiersSlide({ game, config }: { game: GameId; config: GameConfig }) {
  const rows = game === 'bonus' ? config.bonus.multiplier.map((v, i) => ({ round: i + 1, value: `×${v}`, note: `Collective bonus · total ≤ ${config.bonus.threshold[i]}${i === 2 ? ` · ${config.bonus.stars} star${config.bonus.stars === 1 ? '' : 's'} to highest payout` : ''}` }))
    : game === 'high-low' ? config.highLow.multiplier.map((v, i) => ({ round: i + 1, value: `0–${(config.highLow.pool[i] * v).toLocaleString('en-US')}`, note: i === 2 ? `${config.highLow.stars} stars to lowest-choice winner` : 'Choose your amount' }))
    : game === 'cave' ? config.cave.growth.map((v, i) => ({ round: i + 1, value: `×${v}`, note: `$${config.cave.startingMoney[i]} start · cumulative banked money${i === 2 ? ` · ${config.cave.stars} stars to top total` : ''}` }))
    : game === 'circle' ? config.circle.multiplier.map((v, i) => ({ round: i + 1, value: `×${v}`, note: 'sent money and stars · no new stars' }))
    : config.bomb.factor.map((v, i) => ({ round: i + 1, value: `×${v}`, note: 'up multiplies · down divides' }))
  return <Frame game={game} label="round modifiers"><div className="game-modifiers-layout"><div className="game-modifier-line" aria-hidden="true"/><div className="game-modifier-rows">{rows.map(row => <div className="game-modifier-row" key={row.round}>
    <span className="modifier-round">{row.round}</span><strong>{row.value}</strong><span>{row.note}</span>{game === 'cave' && <small>max {config.cave.maxTicks} windows · {config.cave.tickSeconds}s each</small>}
  </div>)}</div>{game === 'bomb' && <p className="game-modifier-foot">No finale stars · most-starred team: {config.bomb.advantageChits} chits per pile · others: {config.bomb.maxChits}</p>}</div></Frame>
}

export function GameInputDemoSlide({ game, step, config }: { game: GameId; step: number; config: GameConfig }) {
  const [amount, setAmount] = useState('20.00')
  const [decision, setDecision] = useState<'stay' | 'leave'>('stay')
  const [stars, setStars] = useState('1')
  const [money, setMoney] = useState('20.00')
  const [counts, setCounts] = useState({ up: '4', down: '3', cedar: '2', maple: '1', finch: '1' })
  const [saved, setSaved] = useState(false)
  const max = game === 'bonus' ? config.bonus.bag[0] : config.highLow.pool[0] * config.highLow.multiplier[0]
  const moneyLabel = game === 'circle' && step >= 1 ? 'Money to return' : 'Money to send'
  const starsLabel = game === 'circle' && step >= 1 ? 'Stars to return' : 'Stars to send'
  const bombLimits = `${config.bomb.minChits}–${config.bomb.maxChits} chits per pile`
  return <Frame game={game} label="illustrative player input"><div className="game-demo-layout"><div className="demo-phone"><div className="demo-phone-top"><span>Illustrative demo</span><span className="demo-dots" aria-hidden="true">•••</span></div><div className="demo-phone-title">{game === 'bonus' ? 'How much will you take?' : game === 'high-low' ? 'Choose your amount' : game === 'cave' ? 'Your decision' : game === 'circle' ? step >= 1 ? 'Return to sender' : 'Send around the circle' : step >= 1 ? 'Recipient pile' : 'Direction pile'}</div>
      {(game === 'bonus' || game === 'high-low') && <div className="demo-field"><label htmlFor="demo-amount">{game === 'bonus' ? 'Amount to take' : 'Choose an amount'}</label><input id="demo-amount" type="text" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setSaved(false) }} /><small>Maximum ${max.toFixed(2)}</small></div>}
      {game === 'cave' && <div className="demo-choice"><button type="button" aria-pressed={decision === 'stay'} onClick={() => { setDecision('stay'); setSaved(false) }}>Stay</button><button type="button" aria-pressed={decision === 'leave'} onClick={() => { setDecision('leave'); setSaved(false) }}>Leave and bank</button></div>}
      {game === 'circle' && <div className="demo-choice"><div className="demo-field"><label htmlFor="demo-circle-money">{moneyLabel}</label><input id="demo-circle-money" type="text" inputMode="decimal" value={money} onChange={e => { setMoney(e.target.value); setSaved(false) }} /></div><DemoCounter id="demo-circle-stars" label={starsLabel} value={stars} onChange={v => { setStars(v); setSaved(false) }} max={5} /><small>{step >= 1 ? 'Returns are not multiplied.' : `Sent money and stars multiply ×${config.circle.multiplier[0]}.`}</small></div>}
      {game === 'bomb' && step < 1 && <div className="demo-choice"><p>Direction pile · {bombLimits}</p><DemoCounter id="demo-up" label="Up chits" value={counts.up} onChange={v => { setCounts({ ...counts, up: v }); setSaved(false) }} max={config.bomb.maxChits} /><DemoCounter id="demo-down" label="Down chits" value={counts.down} onChange={v => { setCounts({ ...counts, down: v }); setSaved(false) }} max={config.bomb.maxChits} /></div>}
      {game === 'bomb' && step >= 1 && <div className="demo-choice"><p>Recipient pile · {bombLimits}</p>{(['cedar', 'maple', 'finch'] as const).map((team, i) => <DemoCounter key={team} id={`demo-recipient-${team}`} label={`Team ${['Cedar', 'Maple', 'Finch'][i]} chits`} value={counts[team] ?? '0'} onChange={v => { setCounts({ ...counts, [team]: v }); setSaved(false) }} max={config.bomb.maxChits} />)}</div>}
      <button className="demo-submit" type="button" onClick={() => setSaved(true)}>{saved ? 'Choice saved locally' : game === 'bonus' ? 'Take amount' : game === 'high-low' ? 'Choose amount' : game === 'cave' ? decision === 'stay' ? 'Stay' : 'Leave and bank' : game === 'circle' ? step >= 1 ? 'Return to sender' : 'Send money and stars' : 'Confirm allocation'}</button><p className="demo-note">Fictional example · nothing is submitted</p>
    </div><aside className="demo-explainer"><span className="demo-spark" aria-hidden="true">✳</span><h2>{game === 'cave' ? 'One tap decides.' : game === 'circle' ? step >= 1 ? 'Return, unmultiplied.' : 'Send, then receive.' : game === 'bomb' ? 'Two piles, one draw.' : 'Your choice stays private.'}</h2><p>Try the controls. This example runs only on this slide.</p></aside></div></Frame>
}

export function GameResultsDemoSlide({ game }: { game: 'bonus' | 'high-low' }) {
  return <Frame game={game} label="illustrative round results" heading="Once everyone submits">
    <div className="game-demo-layout game-results-layout">
      <div className="demo-phone results-phone">
        <div className="demo-phone-top"><span>Play · Round 1</span><span className="demo-dots" aria-hidden="true">•••</span></div>
        <div className="results-complete"><span aria-hidden="true">✓</span>Round complete</div>
        <p className="results-earnings-label">Your round earnings</p><p className="results-earnings">{game === 'bonus' ? '$120.00' : '$100.00'}</p>
        <span className="results-wallet-link">View your wallet</span>
        <p className="demo-note">Fictional example</p>
      </div>
      <aside className="demo-explainer results-explainer"><h2>Your earnings.<br/>Only yours.</h2><p>See your payout in Play.<br/>Past rounds: Wallet → Activity.</p><small>{game === 'bonus' ? 'Other choices, the group total and bonus breakdown stay hidden.' : 'Other choices and team payouts stay hidden.'}</small></aside>
    </div>
  </Frame>
}

export function CircleReceivedSlide({ config }: { config: GameConfig }) {
  const multiplier = config.circle.multiplier[0]
  const receivedMoney = (20 * multiplier).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return <Frame game="circle" label="illustrative incoming transfer">
    <div className="game-demo-layout">
      <div className="demo-phone circle-received-phone">
        <div className="demo-phone-top"><span>Play · Round 1</span><span className="demo-dots" aria-hidden="true">•••</span></div>
        <p className="circle-received-sender">Team 7 sent you</p>
        <div className="circle-received-amounts"><div><strong>${receivedMoney}</strong><span>Money</span></div><div><strong>{multiplier}</strong><span>Stars</span></div></div>
        <p className="circle-received-factor">Already multiplied ×{multiplier}</p>
        <p className="demo-note">Fictional example</p>
      </div>
      <aside className="demo-explainer"><h2>Now you know<br/>your sender.</h2><p>After everyone sends, you see who sent to you and what arrived.</p></aside>
    </div>
  </Frame>
}
