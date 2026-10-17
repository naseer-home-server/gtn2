import { Minus, Plus, LockKeyhole, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, parseMoney, validCount, withinMoney } from '@/lib/game-display'
import { usePlayerSession } from './player-context'
import { CaveClock } from './round-status'

export function MoneyField({ id, label, value, onChange, limit, large = false, disabled = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; limit?: string; large?: boolean; disabled?: boolean
}) {
  const invalid = value.trim() !== '' && (parseMoney(value) === null || (limit !== undefined && !withinMoney(value, limit)))
  return <div className={`money-field min-w-0 space-y-2${large ? ' money-field-large' : ''}`}><div className="money-field-heading"><Label htmlFor={id}>{label}</Label>{large && <span className="private-label"><LockKeyhole aria-hidden="true" />Private</span>}</div><Input id={id} type="text" inputMode="decimal" autoComplete="off" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} aria-invalid={invalid} className={large ? 'decision-amount' : undefined} placeholder="0.00" aria-describedby={limit === undefined ? undefined : `${id}-limit`} />{limit !== undefined && <p id={`${id}-limit`} className="text-sm text-muted-foreground">Maximum {formatMoney(limit)}</p>}{invalid && <p className="text-sm text-destructive" role="alert">{parseMoney(value) === null ? 'Enter zero or a positive amount with up to two decimal places.' : 'This amount is above the available limit.'}</p>}</div>
}
function Counter({ id, label, value, onChange, max, disabled = false }: { id: string; label: string; value: string; onChange: (value: string) => void; max: number; disabled?: boolean }) {
  const count = validCount(value) ? Number(value) : 0
  return <div className="counter-row"><Label htmlFor={id}>{label}</Label><div className="counter"><Button type="button" variant="outline" size="icon" aria-label={`Decrease ${label}`} disabled={disabled || count <= 0} onClick={() => onChange(String(Math.max(0, count - 1)))}><Minus /></Button><input id={id} inputMode="numeric" autoComplete="off" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} /><Button type="button" variant="outline" size="icon" aria-label={`Increase ${label}`} disabled={disabled || count >= max} onClick={() => onChange(String(Math.min(max, count + 1)))}><Plus /></Button></div></div>
}
export function DecisionPanel() {
  const { view } = usePlayerSession()
  switch (view.game) {
    case 'bonus': case 'high-low': return <AmountDecision />
    case 'cave': return <CaveDecision />
    case 'circle': return <CircleDecision />
    case 'bomb': return <BombDecision />
    default: return null
  }
}
function AmountDecision() {
  const { view, draft, updateDraft, submit, action, blockedByUncertainTransfer } = usePlayerSession()
  const type = view.game === 'bonus' ? 'bonus.take' : 'high-low.choose'
  const can = view.allowedActions.includes(type)
  if (!can) return null
  const valid = parseMoney(draft.amount) !== null && (view.roundState?.choiceLimit === undefined || withinMoney(draft.amount, view.roundState.choiceLimit))
  return <form className="task-panel amount-task" onSubmit={event => { event.preventDefault(); if (valid && !action.isPending && !blockedByUncertainTransfer) submit({ type, amount: draft.amount }) }}>
    <div className="amount-entry"><MoneyField id={view.game === 'bonus' ? 'bonus-take' : 'high-low-choice'} label={view.game === 'bonus' ? 'Amount to take' : 'Choose an amount'} value={draft.amount} onChange={amount => updateDraft({ amount })} limit={view.roundState?.choiceLimit} large disabled={action.isPending || blockedByUncertainTransfer} /></div>
    <div className="choice-submit"><Button type="submit" disabled={!valid || action.isPending || blockedByUncertainTransfer}>{!action.isPending && <Check aria-hidden="true" />}{action.isPending ? 'Sending your choice…' : view.game === 'bonus' ? 'Take amount' : 'Choose amount'}</Button><p>Your first accepted choice is final.</p></div>
  </form>
}
function CaveDecision() {
  const { view, submit, action, blockedByUncertainTransfer } = usePlayerSession()
  const round = view.roundState
  if (!round || round.phase === 'ready' || round.phase === 'complete' || round.hasLeft) return null
  return <div className="task-panel cave-panel space-y-6"><div><p className="text-sm text-muted-foreground">Your unbanked money</p><p className="money-value mt-2 text-5xl">{formatMoney(round.unbanked ?? '0.00')}</p></div>
    {round.nextTickAt != null && <CaveClock deadline={round.nextTickAt} />}
    {view.allowedActions.includes('cave.decide') && <><div className="grid grid-cols-2 gap-3"><Button disabled={action.isPending || blockedByUncertainTransfer} onClick={() => submit({ type: 'cave.decide', decision: 'stay' })}>Stay</Button><Button className="bg-foreground text-background hover:bg-foreground/85" disabled={action.isPending || blockedByUncertainTransfer} onClick={() => submit({ type: 'cave.decide', decision: 'leave' })}>Leave and bank</Button></div><p className="text-sm text-muted-foreground">Stay to risk the next check. Leave to bank this amount. No response means stay.</p></>}
    {!view.isTeamLeader && <p className="text-sm text-muted-foreground">Discuss the decision with your team leader.</p>}
  </div>
}
function CircleDecision() {
  const { view, draft, updateDraft, submit, action, blockedByUncertainTransfer } = usePlayerSession()
  const round = view.roundState, team = view.team
  if (!round || !team) return null
  const returning = round.phase === 'return'
  const type = returning ? 'circle.return' : 'circle.send'
  const can = view.allowedActions.includes(type)
  const money = returning ? draft.returnMoney : draft.money
  const stars = returning ? draft.returnStars : draft.stars
  const valid = parseMoney(money) !== null && withinMoney(money, team.balance) && validCount(stars) && Number(stars) <= team.stars
  return <>
    {round.sender && <div className="paper-panel my-6 space-y-2"><p className="text-sm text-muted-foreground">Your sender</p><p className="section-heading">{round.sender.name}</p><p>You received {formatMoney(round.received?.money ?? '0.00')} and {round.received?.stars ?? 0} {round.received?.stars === 1 ? 'star' : 'stars'} from {round.sender.name}.</p>{round.returned && <p className="text-sm">You also received back {formatMoney(round.returned.money)} and {round.returned.stars} {round.returned.stars === 1 ? 'star' : 'stars'} in returns.</p>}</div>}
    {can && <form className="task-panel space-y-6" onSubmit={event => { event.preventDefault(); if (valid && !action.isPending && !blockedByUncertainTransfer) submit({ type, money, stars: Number(stars) }) }}>
      <p className="text-sm text-muted-foreground">{returning ? 'Returns are not multiplied.' : `Outgoing money and stars are multiplied ${String(view.rules?.multiplier ?? '—')}×.`}</p>
      <MoneyField id={returning ? 'circle-return-money' : 'circle-send-money'} label={returning ? 'Money to return' : 'Money to send'} value={money} onChange={value => updateDraft(returning ? { returnMoney: value } : { money: value })} limit={team.balance} disabled={action.isPending || blockedByUncertainTransfer} />
      <Counter id={returning ? 'circle-return-stars' : 'circle-send-stars'} label={returning ? 'Stars to return' : 'Stars to send'} value={stars} onChange={value => updateDraft(returning ? { returnStars: value } : { stars: value })} max={team.stars} disabled={action.isPending || blockedByUncertainTransfer} />
      <Button type="submit" disabled={!valid || action.isPending || blockedByUncertainTransfer}>{action.isPending ? 'Sending…' : returning ? `Return to ${round.sender?.name ?? 'your sender'}` : 'Send money and stars'}</Button>
    </form>}
  </>
}
function BombDecision() {
  const { view, draft, updateDraft, submit, action, blockedByUncertainTransfer } = usePlayerSession()
  const round = view.roundState
  if (!round) return null
  const counts = draft.counts, max = round.maxChits ?? 20, min = round.minChits ?? 1
  const numeric = (key: string) => Number(counts[key] || 0)
  const directionTotal = numeric('__up') + numeric('__down')
  const recipientTotal = view.teams.reduce((sum, team) => sum + numeric(team.id), 0)
  const valid = ['__up', '__down', ...view.teams.map(team => team.id)].every(key => validCount(counts[key] ?? '0')) && directionTotal >= min && directionTotal <= max && recipientTotal >= min && recipientTotal <= max
  const update = (key: string, value: string) => updateDraft({ counts: { ...counts, [key]: value } })
  const can = view.allowedActions.includes('bomb.allocate')
  const disabled = action.isPending || blockedByUncertainTransfer
  return <>
    {view.finaleAdvantage && <div className="my-6 border-l-2 border-primary pl-4"><h2 className="text-base font-semibold">The star advantage</h2><p className="mt-1 text-sm text-muted-foreground">{view.teams.find(team => team.id === view.finaleAdvantage?.teamId)?.name ?? 'The most-starred team'} can allocate up to {view.finaleAdvantage.maxChitsPerPile} chits per pile. Everyone else gets {view.finaleAdvantage.standardMaxChits}.</p></div>}
    {round.bombRecipient && <div className="paper-panel my-6"><p className="text-sm text-muted-foreground">The bomb goes to</p><h2 className="section-heading my-2">{round.bombRecipient.name}</h2>{round.bombDirection && <p>Your direction: <strong>{round.bombDirection}</strong></p>}</div>}
    {can && <form className="task-panel space-y-6" onSubmit={event => { event.preventDefault(); if (valid && !disabled) submit({ type: 'bomb.allocate', up: numeric('__up'), down: numeric('__down'), recipients: Object.fromEntries(view.teams.map(team => [team.id, numeric(team.id)])) }) }}>
      <div><h2 className="section-heading">Direction pile</h2><p className="mt-2 text-sm text-muted-foreground">Allocate {min}–{max} chits across up and down.</p><Counter id="bomb-up" label="Up chits" value={counts.__up ?? '0'} onChange={value => update('__up', value)} max={max} disabled={disabled} /><Counter id="bomb-down" label="Down chits" value={counts.__down ?? '0'} onChange={value => update('__down', value)} max={max} disabled={disabled} /><p className="text-sm" aria-live="polite">{Number.isFinite(directionTotal) ? directionTotal : '—'} of {max} chits assigned</p></div>
      <div className="border-t pt-6"><h2 className="section-heading">Recipient pile</h2><p className="mt-2 text-sm text-muted-foreground">Allocate {min}–{max} chits independently. Either pile can have a different total.</p>{view.teams.map(team => <Counter key={team.id} id={`bomb-recipient-${team.id}`} label={`${team.name} chits`} value={counts[team.id] ?? '0'} onChange={value => update(team.id, value)} max={max} disabled={disabled} />)}<p className="text-sm" aria-live="polite">{Number.isFinite(recipientTotal) ? recipientTotal : '—'} of {max} chits assigned</p></div>
      <Button type="submit" disabled={!valid || disabled}>{action.isPending ? 'Sending allocation…' : 'Confirm allocation'}</Button>
    </form>}
  </>
}
