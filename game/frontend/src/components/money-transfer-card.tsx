import type { PlayerGameView } from 'backend/game'
import type { useMoneyTransfer } from '@/hooks/use-money-transfer'
import { ErrorMessage } from '@/components/page-feedback'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function MoneyTransferCard({ view, transfer }: { view: PlayerGameView; transfer: ReturnType<typeof useMoneyTransfer> }) {
  const { action } = transfer
  const blockedByUncertainTransfer = transfer.isUncertainTransferError

  return <Card className="transfer-panel">
    <CardHeader>
      <CardTitle><h2>Send money</h2></CardTitle>
      <CardDescription>Choose who to send to, then set their shares. Transfers stay between the teams involved.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {transfer.canTransfer && transfer.otherTeams.length > 0 && <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full space-y-2">
            <Label htmlFor="money-transfer-total">Total amount to send</Label>
            <Input id="money-transfer-total" type="text" inputMode="decimal" placeholder="0.00" value={transfer.total} disabled={transfer.isPending || transfer.isTransferError} onChange={(event) => transfer.changeTotal(event.target.value)} aria-describedby="money-transfer-balance-hint" />
            <p id="money-transfer-balance-hint" className="text-xs text-muted-foreground">Maximum total: {transfer.team?.balance ?? '0.00'}</p>
          </div>
        </div>

        <fieldset disabled={transfer.isPending || transfer.isTransferError} className="space-y-2 disabled:opacity-70">
          <legend className="mb-2 text-sm font-medium">Recipient teams</legend>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={transfer.isPending || transfer.isTransferError || transfer.recipients.length === transfer.otherTeams.length} onClick={transfer.selectAll}>Select all</Button>
              <Button type="button" variant="outline" size="sm" disabled={transfer.isPending || transfer.isTransferError || transfer.recipients.length === 0} onClick={transfer.clearRecipients}>Clear</Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {transfer.otherTeams.map((team) => <label key={team.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input type="checkbox" checked={transfer.recipients.some((recipient) => recipient.id === team.id)} onChange={(event) => transfer.toggleRecipient(team.id, event.target.checked)} />
              {team.name}
            </label>)}
          </div>
        </fieldset>

        {transfer.preview.length > 0 && <div className="space-y-2">
          <div><p className="text-sm font-medium">Amount for each team</p><p className="text-xs text-muted-foreground">Shares start as equal as possible. You can edit each amount before sending.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{transfer.preview.map(({ recipient, amount }) => <div key={recipient.id} className="space-y-1">
            <Label htmlFor={`money-transfer-share-${recipient.id}`}>{recipient.name}</Label>
            <Input id={`money-transfer-share-${recipient.id}`} type="text" inputMode="decimal" value={amount} placeholder="0.00" disabled={transfer.isPending || transfer.isTransferError} onChange={(event) => transfer.changeAllocation(recipient.id, event.target.value)} />
          </div>)}</div>
        </div>}

        {transfer.validationMessage && <p role="alert" className="text-sm text-destructive">{transfer.validationMessage}</p>}
        {transfer.totalSummary && <p className="text-sm font-medium" aria-live="polite">{transfer.totalSummary}</p>}
        <Button disabled={transfer.isPending || transfer.isTransferError || !transfer.isValidTotal} onClick={transfer.send}>{transfer.isPending ? 'Submitting…' : 'Send money'}</Button>
      </div>}

      {!transfer.canTransfer && view.isTeamLeader && transfer.isClosed && <p className="text-sm text-muted-foreground">Transfers are closed because the game has finished.</p>}
      {!transfer.canTransfer && view.isTeamLeader && !transfer.isClosed && transfer.isPausedForReveal && <p className="text-sm text-muted-foreground">Transfers are paused until play resumes.</p>}
      {!transfer.canTransfer && view.isTeamLeader && !transfer.isClosed && !transfer.isPausedForReveal && view.status === 'waiting' && <p className="text-sm text-muted-foreground">Transfers open when active play begins and your team has a positive balance.</p>}
      {!transfer.canTransfer && view.isTeamLeader && !transfer.isClosed && !transfer.isPausedForReveal && view.status === 'playing' && <p className="text-sm text-muted-foreground">Transfers are available when your team has a positive balance.</p>}
      {!view.isTeamLeader && transfer.isClosed && <p className="text-sm text-muted-foreground">Transfers are closed because the game has finished. You can view your team’s transfer history here.</p>}
      {!view.isTeamLeader && !transfer.isClosed && transfer.isPausedForReveal && <p className="text-sm text-muted-foreground">Transfers are paused until play resumes. You can view your team’s transfer history here.</p>}
      {!view.isTeamLeader && !transfer.isClosed && !transfer.isPausedForReveal && <p className="text-sm text-muted-foreground">Your team leader can send transfers during active play when your team has a positive balance. You can view your team’s transfer history here.</p>}
      {transfer.successNotice && <p role="status" className="text-sm font-medium text-foreground">{transfer.successNotice}</p>}
      {transfer.isDefiniteTransferError && <div className="space-y-2 rounded-md border border-destructive/40 p-3" role="alert">
        <ErrorMessage message={action.error?.message ?? 'The transfer was rejected.'} />
        <p className="text-sm">The server rejected this transfer, so no money was sent. Edit the recipients or total before trying again.</p>
        <Button variant="outline" size="sm" onClick={transfer.editRejectedTransfer}>Edit transfer</Button>
      </div>}
      {transfer.isUncertainTransferError && <div className="space-y-2 rounded-md border border-destructive/40 p-3" role="alert">
        <ErrorMessage message={action.error?.message ?? 'The transfer result is uncertain.'} />
        <p className="text-sm">The result is uncertain. Retrying uses the same request ID to prevent a duplicate transfer. The transfer form and other submissions are paused until this request is confirmed.</p>
        {blockedByUncertainTransfer && <p className="text-sm font-medium">Round actions and reveal-pot contributions are disabled until you retry this transfer.</p>}
        <Button variant="outline" size="sm" disabled={transfer.isPending} onClick={transfer.retry}>Retry the same transfer</Button>
      </div>}

    </CardContent>
  </Card>
}
