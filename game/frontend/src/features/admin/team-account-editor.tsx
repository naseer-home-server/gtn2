import { currencyFromCents, formatTeamBalance as formatCents, parseAccountBalance as parseCurrency, parseAccountStars as parseStars } from './team-account-utils'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import type { AccountCommand, Team } from 'backend/game'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'


type Props = {
  teams: Team[]
  revision: number
  onSave: (command: AccountCommand) => void
  pending: boolean
  error?: string
  onRetry?: () => void
  onRefresh?: () => void
}

type Editing = { team: Team; revision: number }

export function AdminTeamAccounts({ teams, revision, onSave, pending, error, onRetry, onRefresh }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [balance, setBalance] = useState('0.00')
  const [stars, setStars] = useState('0')
  const [reason, setReason] = useState('')
  const [lastCommand, setLastCommand] = useState<AccountCommand | null>(null)
  const wasPending = useRef(false)
  const parsedBalance = parseCurrency(balance)
  const parsedStars = parseStars(stars)
  const visibleError = lastCommand ? error : undefined

  useEffect(() => {
    if (wasPending.current && !pending && !error) {
      setEditing(null)
      setLastCommand(null)
    }
    wasPending.current = pending
  }, [pending, error])

  function openEditor(team: Team) {
    setEditing({ team, revision })
    setBalance(currencyFromCents(team.balance))
    setStars(String(team.stars))
    setReason('')
    setLastCommand(null)
  }

  function closeEditor(open: boolean) {
    if (open || pending) return
    setEditing(null)
    setLastCommand(null)
  }

  function clearAttempt() {
    if (lastCommand) setLastCommand(null)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || !parsedBalance || parsedStars === null || pending) return
    const request: AccountCommand = {
      requestId: crypto.randomUUID(),
      expectedRevision: editing.revision,
      teamId: editing.team.id,
      balance: parsedBalance.normalized,
      stars: parsedStars,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    }
    setLastCommand(request)
    onSave(request)
  }

  function retry() {
    if (!lastCommand || pending) return
    if (onRetry) onRetry()
    else onSave(lastCommand)
  }

  function refreshAccountValues() {
    if (pending || !editing) return
    onRefresh?.()
    setEditing(null)
    setLastCommand(null)
  }

  return <section className="admin-team-accounts space-y-4" aria-labelledby="team-accounts-heading">
    <div><h2 id="team-accounts-heading" className="section-heading">Team accounts</h2><p className="mt-1 text-sm text-muted-foreground">Edit a team’s balance and public star total at any point in the playthrough.</p></div>
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[26rem] border-collapse text-left text-sm">
        <caption className="sr-only">Current team balances and stars</caption>
        <thead><tr className="border-b border-border bg-muted/50 text-muted-foreground"><th scope="col" className="px-4 py-3 font-medium">Team</th><th scope="col" className="px-4 py-3 text-right font-medium">Balance</th><th scope="col" className="px-4 py-3 text-right font-medium">Stars</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{teams.map((team) => <tr key={team.id} className="border-b border-border/70 last:border-0"><th scope="row" className="max-w-64 break-words px-4 py-3 font-medium">{team.name}</th><td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatCents(team.balance)}</td><td className="px-4 py-3 text-right tabular-nums">{team.stars}</td><td className="px-4 py-3 text-right"><Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => openEditor(team)} aria-label={`Edit account for ${team.name}`}>Edit account</Button></td></tr>)}</tbody>
      </table>
    </div>

    <Dialog.Root open={Boolean(editing)} onOpenChange={closeEditor}>
      {editing && <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] max-h-[min(90dvh,48rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl sm:p-7" onEscapeKeyDown={(event) => { if (pending) event.preventDefault() }}>
          <div className="mb-5 flex items-start justify-between gap-4"><div className="min-w-0"><Dialog.Title className="section-heading break-words">Edit {editing.team.name}</Dialog.Title><Dialog.Description className="mt-2 text-sm text-muted-foreground">Set the team’s account values. Their balance stays private; stars are public.</Dialog.Description></div><Dialog.Close asChild><Button type="button" variant="ghost" size="icon" aria-label="Close account editor" disabled={pending}><X aria-hidden="true" /></Button></Dialog.Close></div>
          <div className="mb-5 grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-sm"><div><p className="text-muted-foreground">Current balance</p><p className="mt-1 font-medium tabular-nums">{formatCents(editing.team.balance)}</p></div><div><p className="text-muted-foreground">Current stars</p><p className="mt-1 font-medium tabular-nums">{editing.team.stars}</p></div></div>
          <form className="space-y-5" noValidate onSubmit={submit}>
            <div className="space-y-2"><Label htmlFor="account-balance">New balance</Label><Input id="account-balance" type="text" inputMode="decimal" autoComplete="off" value={balance} disabled={pending} aria-invalid={balance.trim() !== '' && !parsedBalance} aria-describedby="account-balance-hint" onChange={(event) => { clearAttempt(); setBalance(event.target.value) }} /><p id="account-balance-hint" className="text-sm text-muted-foreground">Use a nonnegative amount with up to two decimal places.</p>{balance.trim() !== '' && !parsedBalance && <p className="text-sm text-destructive" role="alert">Enter a valid amount with no more than 1,000 characters.</p>}</div>
            <div className="space-y-2"><Label htmlFor="account-stars">New star total</Label><Input id="account-stars" type="text" inputMode="numeric" autoComplete="off" maxLength={16} value={stars} disabled={pending} aria-invalid={stars.trim() !== '' && parsedStars === null} aria-describedby="account-stars-hint" onChange={(event) => { clearAttempt(); setStars(event.target.value) }} /><p id="account-stars-hint" className="text-sm text-muted-foreground">Use a nonnegative whole number.</p>{stars.trim() !== '' && parsedStars === null && <p className="text-sm text-destructive" role="alert">Enter a whole number up to {Number.MAX_SAFE_INTEGER.toLocaleString()}.</p>}</div>
            <div className="space-y-2"><Label htmlFor="account-reason">Note <span className="font-normal text-muted-foreground">(optional)</span></Label><textarea id="account-reason" maxLength={300} value={reason} disabled={pending} onChange={(event) => { clearAttempt(); setReason(event.target.value) }} placeholder="Why are you changing this account?" className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60" /><p className="text-right text-xs text-muted-foreground">{reason.length}/300</p></div>
            {visibleError && <div className="space-y-3" role="alert"><p className="text-sm text-destructive">{visibleError}</p>{lastCommand && <p className="text-sm text-muted-foreground">This editor keeps the revision from when it opened. Refresh closes this draft; reopen the account editor to use the latest values.</p>}<div className="flex flex-wrap gap-2">{lastCommand && <Button type="button" variant="outline" disabled={pending} onClick={retry}>Retry same update</Button>}{onRefresh && <Button type="button" variant="ghost" disabled={pending} onClick={refreshAccountValues}>Refresh account values</Button>}</div></div>}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><Dialog.Close asChild><Button type="button" variant="outline" className="min-h-12" disabled={pending}>Cancel</Button></Dialog.Close><Button type="submit" className="min-h-12" disabled={pending || !parsedBalance || parsedStars === null}>{pending ? 'Saving account…' : 'Save account'}</Button></div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>}
    </Dialog.Root>
  </section>
}
