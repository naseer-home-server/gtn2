import { useState } from 'react'
import { LockKeyhole, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoneyTransferCard } from '@/components/money-transfer-card'
import { WaitingForTeam } from '@/components/player-game'
import { formatMoney, gameNames, moneyUnits, parseMoney, withinMoney } from '@/lib/game-display'
import { MoneyField } from './game-panels'
import { usePlayerSession } from './player-context'

export function WalletPage() {
  const { view, transfer } = usePlayerSession()
  const [tab, setTab] = useState<'send'|'reveals'|'activity'>('send')
  if (!view.team) return <WaitingForTeam />
  return <>
    <header className="page-intro wallet-intro"><h1 className="display-title">Your wallet</h1><p>Manage your money at the table.</p></header>
    <section className="wallet-balance" aria-label="Your balance"><div className="wallet-account"><span>{view.team.name}</span><LockKeyhole className="size-4" aria-hidden="true" /></div><div className="flex items-center gap-2 text-sm text-muted-foreground">Private team balance</div><p className="money-value">{formatMoney(view.team.balance)}</p><p className="text-sm text-muted-foreground">Only your team can see this amount.</p></section>
    <nav className="section-tabs" aria-label="Wallet sections">{(['send','reveals','activity'] as const).map(value => <button key={value} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{value === 'send' ? 'Send money' : value === 'reveals' ? 'Rank reveals' : 'Activity'}</button>)}</nav>
    {tab === 'send' && <MoneyTransferCard view={view} transfer={transfer} />}
    {tab === 'reveals' && <RankPots />}
    {tab === 'activity' && <WalletActivity />}
  </>
}
function RankPots() {
  const { view } = usePlayerSession()
  return <div><h2 className="section-heading">Where do you stand?</h2><p className="mt-3 mb-6 text-sm text-muted-foreground">Pay to reveal a rank snapshot. Balances stay private. Reveal prices are fixed for the current game.</p><RankPot scope="self" amount={view.privatePot?.amount ?? '0.00'} target={view.privatePot?.target ?? '0.00'} /><RankPot scope="public" amount={view.pot.amount} target={view.pot.target} /></div>
}
function RankPot({ scope, amount, target }: { scope: 'self'|'public'; amount: string; target: string }) {
  const { view, draft, updateDraft, submit, action, blockedByUncertainTransfer } = usePlayerSession()
  const remaining = (parseMoney(target) ?? 0n) - (parseMoney(amount) ?? 0n)
  const balance = parseMoney(view.team?.balance ?? '0') ?? 0n
  const cap = moneyUnits(remaining > balance ? balance : remaining > 0n ? remaining : 0n)
  const value = scope === 'self' ? draft.privatePot : draft.pot
  const positive = (parseMoney(value) ?? 0n) > 0n
  const can = view.allowedActions.includes('pot.contribute') && remaining > 0n && balance > 0n
  const total = parseMoney(target) ?? 0n
  const progress = total > 0n ? Number(((parseMoney(amount) ?? 0n) * 100n) / total) : 0
  return <section className="wallet-pot"><h3>{scope === 'self' ? 'Your rank only' : 'Everyone’s ranks'}</h3><p className="mt-2 text-sm text-muted-foreground">{scope === 'self' ? 'A private snapshot for your team. Other teams keep playing.' : 'Reveal all ranks to everyone. Play pauses until every team acknowledges.'}</p><div className="pot-meter" aria-hidden="true"><span style={{ width: `${Math.min(100,Math.max(0,progress))}%` }} /></div><p className="mb-5 text-sm">{formatMoney(amount)} <span className="text-muted-foreground">of {formatMoney(target)}</span></p>
    {can ? <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (positive && withinMoney(value,cap) && !action.isPending && !blockedByUncertainTransfer) submit({ type: 'pot.contribute', scope, amount: value }) }}><MoneyField id={scope === 'self' ? 'private-pot-contribution' : 'public-pot-contribution'} label="Contribution" value={value} onChange={value => updateDraft(scope === 'self' ? { privatePot: value } : { pot: value })} limit={cap} disabled={action.isPending || blockedByUncertainTransfer} /><Button type="submit" className="w-full" variant={scope === 'self' ? 'default' : 'outline'} disabled={!positive || !withinMoney(value,cap) || action.isPending || blockedByUncertainTransfer}>{action.isPending ? 'Contributing…' : scope === 'self' ? 'Contribute privately' : 'Contribute to public reveal'}</Button></form> : <p className="text-sm text-muted-foreground">{!view.isTeamLeader ? 'Your team leader can contribute.' : total === 0n ? 'This reveal pot is not available yet.' : balance === 0n ? 'You need a positive balance to contribute.' : 'Contributions are unavailable while play is paused.'}</p>}
  </section>
}
function WalletActivity() {
  const { view } = usePlayerSession()
  return <div className="space-y-8"><section><h2 className="section-heading">Round earnings</h2>{!view.earnings.length && <p className="py-6 text-sm text-muted-foreground">Your earnings appear after each round.</p>}{[...view.earnings].reverse().map(entry => <div className="receipt-row" key={`${entry.game}-${entry.round}`}><span>{gameNames[entry.game]}<span className="mt-1 block text-xs text-muted-foreground">Round {entry.round}</span></span><strong>{formatMoney(entry.amount)}</strong></div>)}</section><section><h2 className="section-heading">Transfers</h2><p className="mt-2 text-sm text-muted-foreground">Only transfers involving your team appear here.</p>{!view.moneyTransfers.length && <p className="py-6 text-sm text-muted-foreground">No money sent or received yet.</p>}{[...view.moneyTransfers].reverse().map(receipt => {
    const sent = receipt.fromTeamId === view.team?.id
    const name = view.teams.find(team => team.id === (sent ? receipt.toTeamId : receipt.fromTeamId))?.name ?? 'Another team'
    const Icon = sent ? ArrowUpRight : ArrowDownLeft
    return <div className="receipt-row" key={receipt.id}><span className="flex items-start gap-2"><Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{sent ? 'Sent to' : 'Received from'} {name}</span></span><strong>{sent ? '−' : '+'}{formatMoney(receipt.amount)}</strong></div>
  })}</section></div>
}
