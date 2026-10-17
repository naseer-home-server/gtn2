import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Bot, Check, Dices, LockKeyhole, MessageCircle, Star, UsersRound, Wallet } from 'lucide-react'
import './social-slides.css'

type SlideProps = { step: number }

function Slide({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <article className={`welcome-slide social-slide ${className}`}>{children}<svg className="welcome-frame" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true"><rect x="12" y="12" width="1576" height="876" rx="4" fill="none" /></svg></article>
}

function PhoneDemo({ initial = 'send' }: { initial?: 'send' | 'reveals' | 'teams' }) {
  const [page, setPage] = useState<'play' | 'wallet' | 'chats' | 'teams'>(initial === 'teams' ? 'teams' : 'wallet')
  const [walletTab, setWalletTab] = useState<'send' | 'reveals' | 'activity'>(initial === 'reveals' ? 'reveals' : 'send')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('$5.00')
  const [sent, setSent] = useState(false)
  const [privateReveal, setPrivateReveal] = useState<'closed' | 'shown'>('closed')
  const [publicReveal, setPublicReveal] = useState<'closed' | 'shown'>('closed')
  return <div className="social-phone" aria-label="Illustrative player app demo">
    <div className="social-phone-top"><span>9:41</span><span className="social-phone-speaker" /></div>
    <div className="social-phone-content">
      {page === 'wallet' ? <>
        <header className="social-phone-heading"><h3>Your wallet</h3><p>Manage your money at the table.</p></header>
        <section className="social-phone-balance"><div><span>Maple Foxes</span><LockKeyhole size={12} /></div><small>Private team balance</small><strong>••••</strong><small>Fictional demo</small></section>
        <nav className="social-phone-tabs" aria-label="Wallet sections"><button type="button" className={walletTab === 'send' ? 'active' : ''} onClick={() => setWalletTab('send')}>Send money</button><button type="button" className={walletTab === 'reveals' ? 'active' : ''} onClick={() => setWalletTab('reveals')}>Rank reveals</button><button type="button" className={walletTab === 'activity' ? 'active' : ''} onClick={() => setWalletTab('activity')}>Activity</button></nav>
        {walletTab === 'send' ? <section className="social-phone-panel"><h4>Send money</h4><label className="social-field-label">Total amount to send <span>{amount}</span></label><small className="social-hint">Maximum total: hidden</small><div className="social-amount-options">{['$1.00', '$5.00', '$10.00'].map(value => <button type="button" key={value} className={amount === value ? 'selected' : ''} onClick={() => { setAmount(value); setSent(false) }}>{value}</button>)}</div><div className="social-recipient-head"><b>Recipient teams</b><span><button type="button" onClick={() => { setRecipient('Blue Herons & Cedar Owls'); setSent(false) }}>Select all</button><button type="button" onClick={() => { setRecipient(''); setSent(false) }}>Clear</button></span></div>{['Blue Herons', 'Cedar Owls'].map(name => <button type="button" key={name} className={`social-recipient ${recipient.includes(name) ? 'selected' : ''}`} onClick={() => { setRecipient(recipient.includes(name) ? '' : name); setSent(false) }}><span className="social-check">{recipient.includes(name) ? <Check size={12} /> : null}</span>{name}</button>)}{recipient && <><p className="social-shares-title">Amount for each team</p>{recipient.split(' & ').map(name => <div className="social-share-row" key={name}><span>{name}</span><b>${(Number(amount.slice(1)) / recipient.split(' & ').length).toFixed(2)}</b></div>)}</>}<button type="button" className="social-action" onClick={() => setSent(true)} disabled={!recipient}>{sent ? 'Sent' : 'Send money'}</button>{sent && <small className="social-feedback">Sent {amount} to {recipient}</small>}</section> : walletTab === 'reveals' ? <section className="social-phone-panel"><h4>Where do you stand?</h4><p>Rankings stay hidden unless teams contribute to a reveal.</p><div className="social-pot"><b>Your rank only</b><small>Only your team sees it. Others keep playing.</small><div className="social-meter"><span style={{ width: privateReveal === 'shown' ? '100%' : '0%' }}/></div>{privateReveal === 'closed' ? <button type="button" onClick={() => setPrivateReveal('shown')}>Contribute privately</button> : <><strong className="social-reveal-title">Your rank revealed</strong><b className="social-demo-rank">Maple Foxes · Rank 2</b><button type="button" onClick={() => setPrivateReveal('closed')}>Acknowledge and hide</button></>}</div><div className="social-pot"><b>Everyone’s ranks</b><small>Play pauses until every team acknowledges.</small><div className="social-meter"><span style={{ width: publicReveal === 'shown' ? '100%' : '0%' }}/></div>{publicReveal === 'closed' ? <button type="button" onClick={() => setPublicReveal('shown')}>Contribute to public reveal</button> : <><strong className="social-reveal-title">Public ranks revealed · Play paused</strong><b className="social-demo-rank">Maple Foxes 2 · Blue Herons 1<br/>Cedar Owls 3 · Silver Badgers 4</b><button type="button" onClick={() => setPublicReveal('closed')}>Acknowledge and hide</button></>}</div></section> : <section className="social-phone-panel"><h4>Your activity</h4><p>Your team’s transfers and earnings appear here.</p><small>Fictional demo · no real receipts</small></section>}
      </> : <>
        {page === 'play' && <header className="social-phone-heading"><h3>Play</h3><p>Game decisions appear here.</p></header>}
        {page === 'chats' && <header className="social-phone-heading"><h3>Chats</h3><p>Team conversations.</p></header>}
        {page === 'teams' && <>
        <header className="social-phone-heading"><h3>The teams</h3><p>Stars are public. Balances and ranks stay private.</p></header>
        <p className="social-roster-caption">Listed in fixed team order, not rank order.</p>
        {['Maple Foxes', 'Blue Herons', 'Cedar Owls', 'Silver Badgers'].map((name, i) => <div className="social-team-row" key={name}><span className="social-team-mark">{name[0]}</span><strong>{name}</strong>{i === 0 && <small>Your team</small>}<span className="social-stars"><Star size={13} />{[2, 1, 3, 0][i]}</span></div>)}
        </>}
      </>}
    </div>
    <nav className="social-phone-nav" aria-label="Main navigation"><button type="button" className={page === 'play' ? 'active' : ''} onClick={() => setPage('play')}><Dices/><span>Play</span></button><button type="button" className={page === 'wallet' ? 'active' : ''} onClick={() => setPage('wallet')}><Wallet/><span>Wallet</span></button><button type="button" className={page === 'chats' ? 'active' : ''} onClick={() => setPage('chats')}><MessageCircle/><span>Chats</span></button><button type="button" className={page === 'teams' ? 'active' : ''} onClick={() => setPage('teams')}><UsersRound/><span>Teams</span></button></nav>
  </div>
}

function Revealed({ show, children }: { show: boolean; children: ReactNode }) { return show ? <div className="social-reveal slide-reveal">{children}</div> : null }

export function ArrivalAdvantagesSlide({ step }: SlideProps) {
  return <Slide className="social-arrival"><header className="theory-heading"><h1>Early arrival advantages</h1></header>
    <div className="social-arrival-copy">
      <section className="social-arrival-advantage"><h2>First pick</h2><p>Earlier arrivals choose their teammate first.</p></section>
      <Revealed show={step >= 1}><section className="social-arrival-advantage social-arrival-ties"><h2>Tie priority</h2><p>Ties favour the team whose first member arrived earlier.</p></section></Revealed>
    </div>
  </Slide>
}

export function BriberySlide({ step }: SlideProps) {
  return <Slide className="social-bribery"><header className="theory-heading"><h1>Bribes encouraged</h1></header>
    <div className="social-bribe-copy">
      <section><h2>Make a deal</h2><p>Pay other teams to influence their choices.</p></section>
      <Revealed show={step >= 1}><section className="social-bribe-send"><h2>Send money</h2><p className="social-bribe-route">Wallet → Send money</p><p>Choose the teams and amount.</p></section></Revealed>
    </div>
    <Revealed show={step >= 2}><p className="social-bribe-privacy">Instant transfers. Only sender and recipient see them.</p></Revealed>
  </Slide>
}

export function RevealPotsSlide({ step }: SlideProps) {
  return <Slide className="social-phone-slide"><header className="theory-heading"><h1>Pay to lift the veil</h1><p>Ranks stay hidden. Balances always stay private.</p></header>
    <div className="social-reveal-types"><Revealed show={step >= 0}><section className="social-reveal-type"><div className="social-lock-mark"><LockKeyhole/></div><h2>Private</h2><p>Your rank only.<br/>Everyone else keeps playing.</p></section></Revealed><Revealed show={step >= 1}><section className="social-reveal-type social-public"><div className="social-lock-mark"><UsersRound/></div><h2>Public</h2><p>All ranks for everyone.<br/>Play pauses until all acknowledge.</p></section></Revealed></div>
    <div className="social-phone-slot"><PhoneDemo initial="reveals" /></div>
    <Revealed show={step >= 2}><p className="social-pot-note">Prices change each game; fixed for all 3 rounds.</p><p className="social-pot-route">Wallet <ArrowRight size={15}/> Rank reveals</p></Revealed>
  </Slide>
}

export function TieOrderSlide() {
  return <Slide className="social-tie-instructions"><header className="theory-heading"><h1>Order breaks ties</h1></header>
    <div className="social-tie-copy"><h2>Open Teams</h2><p>Listed in tie-break order.</p></div>
  </Slide>
}

export function StarsSlide() {
  return <Slide className="social-stars-intro"><header className="theory-heading"><h1>Stars <Star aria-hidden="true"/></h1></header>
    <div className="social-stars-copy">
      <section><h2>Earn stars</h2><p>Awarded alongside money.</p></section>
      <section className="social-stars-public"><h2>Public totals</h2><p>See everyone’s stars in Teams.</p></section>
    </div>
    <div className="social-stars-trading"><p>Star trading opens before the finale.</p><small>Circle-game transfers are a separate mechanic.</small></div>
  </Slide>
}

export function HiddenStakesSlide() {
  return <Slide className="social-hidden"><header className="theory-heading"><h1>Some things stay hidden</h1></header>
    <div className="social-hidden-scene">
      <section className="social-hidden-column"><Bot className="social-hidden-icon" aria-hidden="true"/><h2>AI average</h2><p>Secret until all games are over.</p></section>
      <section className="social-hidden-column"><Star className="social-hidden-icon" aria-hidden="true"/><h2>Star advantage</h2><p>Most stars earn a secret finale advantage.</p></section>
    </div>
  </Slide>
}
