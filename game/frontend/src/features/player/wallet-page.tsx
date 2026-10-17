import { useEffect, useRef, useState } from 'react'
import { LockKeyhole, ArrowUpRight, ArrowDownLeft, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { MoneyTransferCard } from '@/components/money-transfer-card'
import { StarTransferCard } from '@/components/star-transfer-card'
import { WaitingForTeam } from '@/components/player-game'
import { formatMoney, gameNames, moneyUnits, parseMoney, withinMoney } from '@/lib/game-display'
import { MoneyField } from './game-panels'
import { usePlayerSession } from './player-context'

export function WalletPage() {
  const { view, transfer } = usePlayerSession()
  const [tab, setTab] = useState<'send'|'stars'|'reveals'|'activity'>('send')
  if (!view.team) return <WaitingForTeam />
  return <>
    <header className="page-intro wallet-intro"><h1 className="display-title">Your wallet</h1><p>Manage your money at the table.</p></header>
    <section className="wallet-balance" aria-label="Your balance"><div className="wallet-account"><span>{view.team.name}</span><LockKeyhole className="size-4" aria-hidden="true" /></div><div className="flex items-center gap-2 text-sm text-muted-foreground">Private team balance</div><p className="money-value">{formatMoney(view.team.balance)}</p><p className="text-sm text-muted-foreground">Only your team can see this amount.</p></section>
    <nav className="section-tabs" aria-label="Wallet sections">{(view.starsTransferOpen ? ['send','stars','reveals','activity'] as const : ['send','reveals','activity'] as const).map(value => <button key={value} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{value === 'send' ? 'Send money' : value === 'stars' ? 'Send stars' : value === 'reveals' ? 'Rank reveals' : 'Activity'}</button>)}</nav>
    {tab === 'send' && <MoneyTransferCard view={view} transfer={transfer} />}
    {tab === 'stars' && <StarTransferCard />}
    {tab === 'reveals' && <RankPots />}
    {tab === 'activity' && <WalletActivity />}
  </>
}
function RankPots() {
  const { view } = usePlayerSession()
  return <div><h2 className="section-heading">Where do you stand?</h2><p className="mt-3 mb-6 text-sm text-muted-foreground">Rankings stay hidden unless teams contribute to a reveal. Balances stay private, and each price is fixed for the current game.</p><div className="rank-pot-list"><RankPot scope="self" amount={view.privatePot?.amount ?? '0.00'} target={view.privatePot?.target ?? '0.00'} /><RankPot scope="public" amount={view.pot.amount} target={view.pot.target} /></div></div>
}
function RankPot({ scope, amount, target }: { scope: 'self'|'public'; amount: string; target: string }) {
  const { view, draft, updateDraft, submit, retry, action, blockedByUncertainTransfer } = usePlayerSession()
  const [open, setOpen] = useState(false)
  const closeAfterContribution = useRef(false)
  const remaining = (parseMoney(target) ?? 0n) - (parseMoney(amount) ?? 0n)
  const balance = parseMoney(view.team?.balance ?? '0') ?? 0n
  const cap = moneyUnits(remaining > balance ? balance : remaining > 0n ? remaining : 0n)
  const value = scope === 'self' ? draft.privatePot : draft.pot
  const positive = (parseMoney(value) ?? 0n) > 0n
  const can = view.allowedActions.includes('pot.contribute') && remaining > 0n && balance > 0n
  const total = parseMoney(target) ?? 0n
  const progress = total > 0n ? Number(((parseMoney(amount) ?? 0n) * 100n) / total) : 0
  const title = scope === 'self' ? 'Your rank only' : 'Everyone’s ranks'
  const actionLabel = scope === 'self' ? 'Contribute privately' : 'Contribute to public reveal'
  const actionError = action.error && action.variables?.action.type === 'pot.contribute' && action.variables.action.scope === scope ? action.error : null
  const canSubmit = can && positive && withinMoney(value, cap) && !action.isPending && !blockedByUncertainTransfer
  const progressValue = Math.min(100, Math.max(0, progress))
  const progressLabel = `${progressValue}% funded`
  const progressWidth = `${progressValue}%`

  useEffect(() => {
    if (!closeAfterContribution.current) return
    if (action.isSuccess && action.variables?.action.type === 'pot.contribute' && action.variables.action.scope === scope) {
      closeAfterContribution.current = false
      setOpen(false)
    } else if (action.isError) {
      closeAfterContribution.current = false
    }
  }, [action.isError, action.isSuccess, action.variables, scope])
  return <>
    <section className="wallet-pot" aria-label={`${title} pot`}>
      <div className="wallet-pot-heading"><div><h3>{title}</h3><p>{scope === 'self' ? 'Only your team sees the snapshot. Other teams keep playing.' : 'Everyone sees the ranks. Play pauses until each team acknowledges.'}</p></div><span className="wallet-pot-scope">{scope === 'self' ? 'Private' : 'Public'}</span></div>
      <div className="pot-meter" role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue} aria-valuetext={progressLabel}><span style={{ width: progressWidth }} /></div>
      <div className="wallet-pot-amounts"><strong>{formatMoney(amount)}</strong><span>of {formatMoney(target)}</span></div>
      <Button className="wallet-pot-open" variant={scope === 'self' ? 'default' : 'outline'} onClick={() => setOpen(true)}>{actionLabel}</Button>
    </section>
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen && action.isPending) return; setOpen(isOpen) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay reveal-dialog-overlay" />
        <Dialog.Content className="pot-contribution-dialog" aria-describedby={`pot-contribution-description-${scope}`}>
          <div className="pot-dialog-heading"><div><Dialog.Title className="section-heading">{actionLabel}</Dialog.Title><Dialog.Description id={`pot-contribution-description-${scope}`} className="pot-dialog-description">{scope === 'self' ? 'Your team can reveal its own current rank. Other teams continue play.' : 'When the pot fills, everyone sees the ranking snapshot and play pauses until all teams acknowledge.'}</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close contribution" disabled={action.isPending}><X /></Button></Dialog.Close></div>
          <div className="pot-dialog-content">
          <div className="pot-dialog-progress"><div className="pot-meter" role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue} aria-valuetext={progressLabel}><span style={{ width: progressWidth }} /></div><div className="pot-dialog-figures"><span><small>In the pot</small><strong>{formatMoney(amount)}</strong></span><span><small>Target</small><strong>{formatMoney(target)}</strong></span><span><small>Still needed</small><strong>{formatMoney(remaining > 0n ? moneyUnits(remaining) : '0')}</strong></span><span><small>Your balance</small><strong>{formatMoney(view.team?.balance ?? '0')}</strong></span></div></div>
            {can ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (canSubmit) { closeAfterContribution.current = true; submit({ type: 'pot.contribute', scope, amount: value }) } }}>
              <MoneyField id={scope === 'self' ? 'private-pot-contribution' : 'public-pot-contribution'} label="Contribution" value={value} onChange={next => updateDraft(scope === 'self' ? { privatePot: next } : { pot: next })} limit={cap} disabled={action.isPending || blockedByUncertainTransfer} />
              <p className="pot-dialog-hint">You can contribute up to {formatMoney(cap)} from your current balance.</p>
              {actionError && <div className="pot-dialog-error" role="alert"><p>{actionError.message}</p><Button variant="outline" size="sm" disabled={action.isPending || blockedByUncertainTransfer} onClick={() => { closeAfterContribution.current = true; retry() }}>Retry same contribution</Button></div>}
              <Button type="submit" className="w-full" disabled={!canSubmit}>{action.isPending ? 'Contributing…' : actionLabel}</Button>
            </form> : <p className="pot-dialog-unavailable">{!view.isTeamLeader ? 'Your team leader can contribute.' : total === 0n ? 'This reveal pot is not available yet.' : balance === 0n ? 'Your team needs a positive balance to contribute.' : 'Contributions are unavailable while play is paused.'}</p>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
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
