import { useEffect, useState } from 'react'
import type { GameAction, GameId } from 'backend/game'
import { usePlayerGame } from '@/hooks/use-gameplay'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'
import { MoneyTransferCard } from '@/components/money-transfer-card'

const money = (amount: string) => amount
function cents(value: string): bigint | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,2}))?$/)
  if (!match) return null
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
}
function displayCents(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}
function lessOrEqualMoney(a: string, b: string) {
  const left = cents(a); const right = cents(b)
  return left !== null && right !== null && left <= right
}
function minMoney(a: string, b: string) {
  const left = cents(a) ?? 0n; const right = cents(b) ?? 0n
  return displayCents(left < right ? left : right)
}
const gameNames: Record<GameId, string> = {
  bonus: 'Will we get bonus this year', 'high-low': 'High or low', cave: 'Cave mining', circle: 'What goes around comes around', bomb: 'Gamble bomb',
}
const actionName: Record<GameAction['type'], string> = {
  'bonus.take': 'Submit take', 'high-low.choose': 'Submit choice', 'cave.decide': 'Submit decision', 'circle.send': 'Send transfer', 'circle.return': 'Return transfer', 'bomb.allocate': 'Submit allocation', 'pot.contribute': 'Contribute to reveal pot', 'money.transfer': 'Send money', 'reveal.acknowledge': 'Acknowledge reveal',
}
function NumberField({ id, label, value, onChange, min = 0, max, step = '0.01' }: { id: string; label: string; value: string; onChange: (v: string) => void; min?: number; max?: string | number; step?: string }) {
  return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><Input id={id} type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} /></div>
}

export function PlayerGame() {
  const { state, action, submit, retry, blockedByUncertainTransfer } = usePlayerGame()
  const view = state.data
  const [amount, setAmount] = useState('0')
  const [potAmount, setPotAmount] = useState('0')
  const [privatePotAmount, setPrivatePotAmount] = useState('0')
  const [moneyAmount, setMoneyAmount] = useState('0')
  const [starAmount, setStarAmount] = useState('0')
  const [returnMoney, setReturnMoney] = useState('0')
  const [returnStars, setReturnStars] = useState('0')
  const [recipients, setRecipients] = useState<Record<string, string>>({})
  useEffect(() => {
    setAmount('0'); setPotAmount('0'); setPrivatePotAmount('0'); setMoneyAmount('0'); setStarAmount('0'); setReturnMoney('0'); setReturnStars('0'); setRecipients({})
  }, [view?.token])
  const can = (type: GameAction['type']) => Boolean(view?.allowedActions.includes(type))
  const numeric = (value: string) => Number(value || 0)

  if (state.isPending) return <LoadingMessage />
  if (state.error) return <ErrorMessage message={state.error.message} />
  if (!view) return null
  const team = view.team
  const round = view.roundState
  const history = [...view.earnings].reverse()
  const potRemainingMinor = (cents(view.pot.target) ?? 0n) - (cents(view.pot.amount) ?? 0n)
  const privatePotRemainingMinor = (cents(view.privatePot?.target ?? '0.00') ?? 0n) - (cents(view.privatePot?.amount ?? '0.00') ?? 0n)
  const potRemaining = displayCents(potRemainingMinor > 0n ? potRemainingMinor : 0n)
  const privatePotRemaining = displayCents(privatePotRemainingMinor > 0n ? privatePotRemainingMinor : 0n)
  const potCap = team ? minMoney(team.balance, potRemaining) : '0.00'
  const privatePotCap = team ? minMoney(team.balance, privatePotRemaining) : '0.00'
  const canContribute = can('pot.contribute') && team && (cents(team.balance) ?? 0n) > 0n
  const isSubmitted = Boolean(round?.submitted)
  const submitAction = (payload: GameAction) => submit(payload)
  const submissionDisabled = action.isPending || blockedByUncertainTransfer
  const allRecipients = view.teams.reduce((sum, item) => sum + numeric(recipients[item.id] ?? '0'), 0)
  const maxChits = round?.maxChits ?? 20
  const minChits = round?.minChits ?? 1
  const upChits = numeric(recipients.__up ?? '0')
  const downChits = numeric(recipients.__down ?? '0')
  const validChitCount = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
  const validBombPiles = validChitCount(recipients.__up ?? '0') && validChitCount(recipients.__down ?? '0')
    && view.teams.every((item) => validChitCount(recipients[item.id] ?? '0'))
    && upChits + downChits >= minChits && upChits + downChits <= maxChits
    && allRecipients >= minChits && allRecipients <= maxChits

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Game</h1><p className="text-sm text-muted-foreground">{view.sessionName}</p></div>{view.status === 'playing' && view.game && <Badge>{gameNames[view.game]} · Round {view.round}</Badge>}</div>
    {!team ? <>
      <Card><CardHeader><CardTitle><h2>{view.status === 'waiting' ? 'Waiting for team assignment' : 'No team assigned'}</h2></CardTitle><CardDescription>The game host will assign you to a team before play begins.</CardDescription></CardHeader></Card>
      {view.teams.length > 0 && <Card><CardHeader><CardTitle><h2>Teams and stars</h2></CardTitle><CardDescription>Star totals are public. Balances and ranks are private.</CardDescription></CardHeader><CardContent className="space-y-2">{view.teams.map((item) => <div key={item.id} className="flex justify-between rounded-md border px-3 py-2"><span>{item.name}</span><span>{item.stars} ★</span></div>)}</CardContent></Card>}
    </> : <>
      <Card><CardHeader><CardTitle><h2>{team.name}</h2></CardTitle><CardDescription>Your balance and rank stay private unless your team pays for a rank reveal.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><div><p className="text-sm text-muted-foreground">Balance</p><p className="text-xl font-semibold">{money(team.balance)}</p></div><div><p className="text-sm text-muted-foreground">Stars</p><p className="text-xl font-semibold">{team.stars}</p></div></CardContent></Card>
      <Card className={view.isTeamLeader ? 'border-primary/40' : 'border-muted'}><CardContent className="py-4"><p className="text-sm">{view.isTeamLeader
        ? 'You are the team leader based on arrival order. Discuss choices in person before submitting.'
        : 'Your teammate arrived first and leads your team. Discuss game choices with them in person; only their account can submit decisions, money transfers, reveal acknowledgments, or reveal-pot contributions. You can still send messages in Chats.'}</p></CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle><h2>Public rank reveal</h2></CardTitle><CardDescription>When funded, every team sees every team’s rank. The reveal pauses play until all teams acknowledge it.</CardDescription></CardHeader><CardContent className="space-y-3"><p>{money(view.pot.amount)} / {money(view.pot.target)}</p>{canContribute && potRemainingMinor > 0n && <div className="flex flex-wrap items-end gap-3"><div className="w-40"><NumberField id="public-pot-contribution" label="Contribution" value={potAmount} onChange={setPotAmount} max={potCap} /></div><Button disabled={submissionDisabled || (cents(potAmount) ?? 0n) <= 0n || !lessOrEqualMoney(potAmount, potCap)} onClick={() => submitAction({ type: 'pot.contribute', scope: 'public', amount: potAmount })}>{action.isPending ? 'Submitting…' : 'Contribute'}</Button></div>}</CardContent></Card>
        <Card><CardHeader><CardTitle><h2>Private self rank reveal</h2></CardTitle><CardDescription>Only your team sees its own rank. Price is one fifth of the public reveal price.</CardDescription></CardHeader><CardContent className="space-y-3"><p>{money(view.privatePot?.amount ?? '0.00')} / {money(view.privatePot?.target ?? '0.00')}</p>{canContribute && privatePotRemainingMinor > 0n && <div className="flex flex-wrap items-end gap-3"><div className="w-40"><NumberField id="private-pot-contribution" label="Contribution" value={privatePotAmount} onChange={setPrivatePotAmount} max={privatePotCap} /></div><Button disabled={submissionDisabled || (cents(privatePotAmount) ?? 0n) <= 0n || !lessOrEqualMoney(privatePotAmount, privatePotCap)} onClick={() => submitAction({ type: 'pot.contribute', scope: 'self', amount: privatePotAmount })}>{action.isPending ? 'Submitting…' : 'Contribute'}</Button></div>}</CardContent></Card>
      </div>
      <MoneyTransferCard view={view} action={action} submit={submitAction} retry={retry} blockedByUncertainTransfer={blockedByUncertainTransfer} />
      {view.reveal && <Card className="border-primary"><CardHeader><CardTitle><h2>{view.reveal.scope === 'public' ? 'Public rankings revealed' : 'Your rank revealed'}</h2></CardTitle><CardDescription>{view.reveal.scope === 'public' ? 'Every team can see these ranks. They hide again after each team acknowledges.' : 'Only your team can see this rank. It hides after you acknowledge.'}</CardDescription></CardHeader><CardContent className="space-y-3"><ol className="list-inside list-decimal space-y-1">{view.reveal.rankings.map((rank) => <li key={rank.teamId}>{view.teams.find((item) => item.id === rank.teamId)?.name ?? rank.teamId} — rank {rank.rank}</li>)}</ol>{can('reveal.acknowledge') && <Button disabled={submissionDisabled} onClick={() => submitAction({ type: 'reveal.acknowledge' })}>{actionName['reveal.acknowledge']}</Button>}</CardContent></Card>}
      {view.teams.length > 0 && <Card><CardHeader><CardTitle><h2>Teams and stars</h2></CardTitle><CardDescription>Star totals are public. Other teams’ balances and ranks stay private.</CardDescription></CardHeader><CardContent className="space-y-2">{view.teams.map((item) => <div key={item.id} className="flex justify-between rounded-md border px-3 py-2"><span>{item.name}{item.id === team.id ? ' (you)' : ''}</span><span>{item.stars} ★</span></div>)}</CardContent></Card>}
      {view.status === 'playing' && round && view.game && <>
        {view.rules && <RoundSettings game={view.game} rules={view.rules} />}
        {view.game === 'cave' && round.tick !== undefined && round.phase !== 'ready' && <p className="text-sm text-muted-foreground">Tick {round.tick} of {Number(view.rules?.maxTicks ?? 10)}. Teams still inside automatically bank their money when the final window expires.</p>}
        {view.game === 'bomb' && view.finaleAdvantage && <Card><CardHeader><CardTitle><h2>Finale advantage revealed</h2></CardTitle></CardHeader><CardContent><p>{view.teams.find((item) => item.id === view.finaleAdvantage?.teamId)?.name ?? 'The most-starred team'} can allocate up to {view.finaleAdvantage.maxChitsPerPile} chits per pile. Other teams can allocate up to {view.finaleAdvantage.standardMaxChits}.</p></CardContent></Card>}
        <Card><CardHeader><CardTitle><h2>{gameNames[view.game]}</h2></CardTitle><CardDescription>{phaseDescription(view.game, round.phase, round.unbanked, round.nextTickAt, can('cave.decide'), round.hasLeft)}</CardDescription>{view.game === 'cave' && round.nextTickAt != null && <CaveTickCountdown nextTickAt={round.nextTickAt} />}</CardHeader><CardContent className="space-y-4">
        {view.game === 'bonus' && can('bonus.take') && !isSubmitted && <><NumberField id="bonus-take" label="Amount to take" value={amount} onChange={setAmount} max={round.choiceLimit} /><Button disabled={submissionDisabled || (cents(amount) ?? -1n) < 0n || (round.choiceLimit !== undefined && !lessOrEqualMoney(amount, round.choiceLimit))} onClick={() => submitAction({ type: 'bonus.take', amount })}>Submit take</Button></>}
        {view.game === 'high-low' && can('high-low.choose') && !isSubmitted && <><NumberField id="high-low-choice" label="Choose an amount" value={amount} onChange={setAmount} max={round.choiceLimit} /><Button disabled={submissionDisabled || (cents(amount) ?? -1n) < 0n || (round.choiceLimit !== undefined && !lessOrEqualMoney(amount, round.choiceLimit))} onClick={() => submitAction({ type: 'high-low.choose', amount })}>Submit choice</Button></>}
        {view.game === 'cave' && can('cave.decide') && !isSubmitted && <div className="flex gap-2"><Button disabled={submissionDisabled} onClick={() => submitAction({ type: 'cave.decide', decision: 'stay' })}>Stay</Button><Button variant="outline" disabled={submissionDisabled} onClick={() => submitAction({ type: 'cave.decide', decision: 'leave' })}>Leave and bank</Button></div>}
        {view.game === 'cave' && round.hasLeft && <p className="text-sm text-muted-foreground">You have left the cave. Your banked amount is safe.</p>}
        {view.game === 'circle' && round.sender && <div className="rounded-md border p-3"><p className="font-medium">Sender: {round.sender.name}</p><p className="text-sm text-muted-foreground">Received {money(round.received?.money ?? '0.00')} and {round.received?.stars ?? 0} stars</p>{round.returned && <p className="text-sm text-muted-foreground">Received back {money(round.returned.money)} and {round.returned.stars} stars</p>}</div>}
        {view.game === 'circle' && can('circle.send') && !isSubmitted && <div className="grid gap-3 sm:grid-cols-2"><NumberField id="circle-send-money" label="Money to send" value={moneyAmount} onChange={setMoneyAmount} max={team.balance} /><NumberField id="circle-send-stars" label="Stars to send" value={starAmount} onChange={setStarAmount} max={team.stars} step="1" /><Button disabled={submissionDisabled || (cents(moneyAmount) ?? -1n) < 0n || !lessOrEqualMoney(moneyAmount, team.balance) || !validChitCount(starAmount) || numeric(starAmount) > team.stars} onClick={() => submitAction({ type: 'circle.send', money: moneyAmount, stars: numeric(starAmount) })}>Send</Button></div>}
        {view.game === 'circle' && can('circle.return') && !isSubmitted && <div className="grid gap-3 sm:grid-cols-2"><NumberField id="circle-return-money" label="Money to return" value={returnMoney} onChange={setReturnMoney} max={team.balance} /><NumberField id="circle-return-stars" label="Stars to return" value={returnStars} onChange={setReturnStars} max={team.stars} step="1" /><Button disabled={submissionDisabled || (cents(returnMoney) ?? -1n) < 0n || !lessOrEqualMoney(returnMoney, team.balance) || !validChitCount(returnStars) || numeric(returnStars) > team.stars} onClick={() => submitAction({ type: 'circle.return', money: returnMoney, stars: numeric(returnStars) })}>Return</Button></div>}
        {view.game === 'bomb' && round.bombRecipient && <div className="rounded-md border p-3"><p>Bomb recipient: <span className="font-medium">{round.bombRecipient.name}</span></p>{round.bombDirection && <p>Your direction: <span className="font-medium">{round.bombDirection}</span></p>}</div>}
        {view.game === 'bomb' && can('bomb.allocate') && !isSubmitted && <div className="space-y-3"><p className="text-sm">Each pile accepts {minChits}–{maxChits} chits. Choose private counts for up/down and each possible recipient.</p><div className="grid gap-3 sm:grid-cols-2"><NumberField id="bomb-up" label="Up chits" value={recipients.__up ?? '0'} onChange={(v) => setRecipients((x) => ({ ...x, __up: v }))} max={maxChits} step="1" /><NumberField id="bomb-down" label="Down chits" value={recipients.__down ?? '0'} onChange={(v) => setRecipients((x) => ({ ...x, __down: v }))} max={maxChits} step="1" /></div>{view.teams.map((item) => <NumberField key={item.id} id={`bomb-recipient-${item.id}`} label={`${item.name} chits`} value={recipients[item.id] ?? '0'} onChange={(v) => setRecipients((x) => ({ ...x, [item.id]: v }))} max={maxChits} step="1" />)}<Button disabled={submissionDisabled || !validBombPiles} onClick={() => { const counts = Object.fromEntries(view.teams.map((item) => [item.id, numeric(recipients[item.id] ?? '0')])); submitAction({ type: 'bomb.allocate', up: upChits, down: downChits, recipients: counts }) }}>Submit allocation</Button></div>}
        {isSubmitted && <p role="status" className="text-sm text-muted-foreground">Your action is submitted. Waiting for the round to continue.</p>}
        </CardContent></Card>
      </>}
      {action.error && action.variables?.action.type !== 'money.transfer' && <div className="space-y-2"><ErrorMessage message={action.error.message} /><Button variant="outline" size="sm" disabled={action.isPending} onClick={() => retry()}>Retry the same action</Button></div>}
      {history.length > 0 && <Card><CardHeader><CardTitle><h2>Your round earnings</h2></CardTitle></CardHeader><CardContent className="space-y-2">{history.map((entry, i) => <div key={`${entry.game}-${entry.round}-${i}`} className="flex justify-between border-b py-2 last:border-0"><span>{gameNames[entry.game]} · Round {entry.round}</span><span>{money(entry.amount)}</span></div>)}</CardContent></Card>}
      {view.status === 'finished' && <p className="text-sm text-muted-foreground">The game is finished. Your final balance is shown above.</p>}
    </>}
  </div>
}

function CaveTickCountdown({ nextTickAt }: { nextTickAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.ceil((nextTickAt - now) / 1000))
  return <p role="timer" aria-live="off" className="mt-2 text-sm font-semibold text-foreground">Next cave tick in {seconds} {seconds === 1 ? 'second' : 'seconds'}</p>
}
function phaseDescription(game: GameId, phase: string, unbanked?: string, nextTickAt?: number | null, canDecide = false, hasLeft = false) {
  if (phase === 'ready') return 'Waiting for the host to start this round.'
  if (game === 'cave') {
    if (hasLeft) return 'You left the cave. Your banked amount is safe.'
    if (phase === 'complete') return 'The cave round is complete.'
    if (canDecide) return `Unbanked: ${money(unbanked ?? '0.00')}. Choose to stay for the next tick or leave and bank this amount.`
    if (nextTickAt) return `Unbanked: ${money(unbanked ?? '0.00')}. Waiting for the automatic cave tick.`
    return `Unbanked: ${money(unbanked ?? '0.00')}. Waiting for the cave to resolve.`
  }
  if (game === 'circle') return phase === 'return' ? 'Choose money and stars to return to your sender.' : 'Choose money and stars to send to the next team.'
  if (game === 'bomb') return 'Allocate up/down chits and choose the recipients for your piles.'
  return 'Submit your choice for this round.'
}

function RoundSettings({ game, rules }: { game: GameId; rules: Record<string, unknown> }) {
  const rows: [string, string][] = []
  const value = (key: string) => rules[key]
  if (game === 'bonus') rows.push(['Bag amount', String(value('bag') ?? '—')], ['Collective threshold', String(value('threshold') ?? '—')], ['Threshold multiplier', `${String(value('multiplier') ?? '—')}×`], ['Round-three stars', String(value('roundThreeStars') ?? '—')])
  if (game === 'high-low') rows.push(['Base pool', String(value('pool') ?? '—')], ['Stake multiplier', `${String(value('multiplier') ?? '—')}×`], ['Round-three stars', String(value('roundThreeStars') ?? '—')])
  if (game === 'cave') {
    const risks = Array.isArray(value('collapseRisk')) ? value('collapseRisk') as number[] : []
    rows.push(['Maximum ticks', String(value('maxTicks') ?? 10)])
    rows.push(['Starting money', String(value('startingMoney') ?? '—')], ['Growth multiplier', `${String(value('growth') ?? '—')}×`], ['Tick interval', `${String(value('tickSeconds') ?? '—')} seconds`], ['Collapse risk by departures', risks.map((risk, i) => `${i}: ${risk}%`).join(' · ') || '—'], ['Game stars', String(value('gameStars') ?? '—')])
  }
  if (game === 'circle') rows.push(['Transfer multiplier', `${String(value('multiplier') ?? '—')}×`])
  if (game === 'bomb') rows.push(['Bomb factor', `${String(value('factor') ?? '—')}×`])
  return <Card><CardHeader><CardTitle><h2>Round settings</h2></CardTitle><CardDescription>Public settings for this round.</CardDescription></CardHeader><CardContent><dl className="grid gap-2 sm:grid-cols-2">{rows.map(([label, setting]) => <div key={label} className="flex justify-between gap-3 border-b pb-2 last:border-0"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{setting}</dd></div>)}</dl></CardContent></Card>
}
