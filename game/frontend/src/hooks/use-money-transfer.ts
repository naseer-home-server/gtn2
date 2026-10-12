import { useEffect, useRef, useState } from 'react'
import type { GameAction, PlayerGameView } from 'backend/game'
import type { usePlayerGame } from '@/hooks/use-gameplay'
import { isDefiniteActionError } from '@/hooks/use-gameplay'

type PlayerActionMutation = ReturnType<typeof usePlayerGame>['action']
type SubmitAction = (action: GameAction) => void

function parseCents(value: string): bigint | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
}

export function formatCents(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}

export function useMoneyTransfer(view: PlayerGameView, action: PlayerActionMutation, submit: SubmitAction, retry: () => void) {
  const [total, setTotal] = useState('')
  const [recipientIds, setRecipientIds] = useState<string[]>([])
  const [successNotice, setSuccessNotice] = useState('')
  const handledRequest = useRef<string | null>(null)

  useEffect(() => {
    setTotal('')
    setRecipientIds([])
    setSuccessNotice('')
  }, [view.token])

  useEffect(() => {
    const command = action.variables
    if (!action.isSuccess || !command || command.action.type !== 'money.transfer' || handledRequest.current === command.requestId) return
    handledRequest.current = command.requestId
    setTotal('')
    setRecipientIds([])
    const count = command.action.recipientTeamIds.length
    setSuccessNotice(`Shared ${formatCents(parseCents(String(command.action.amount)) ?? 0n)} among ${count} ${count === 1 ? 'team' : 'teams'}.`)
  }, [action.data, action.isSuccess, action.variables])

  const team = view.team
  const otherTeams = team ? view.teams.filter((candidate) => candidate.id !== team.id) : []
  const recipients = otherTeams.filter((candidate) => recipientIds.includes(candidate.id))
  const totalCents = parseCents(total)
  const balanceCents = parseCents(team?.balance ?? '0') ?? 0n
  const isValidTotal = /^\d+(?:\.\d{1,2})?$/.test(total.trim())
    && totalCents !== null
    && recipients.length > 0
    && totalCents >= BigInt(recipients.length)
    && totalCents <= balanceCents
  let validationMessage = ''
  if (total.trim()) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(total.trim()) || totalCents === null) validationMessage = 'Enter a positive total with no more than two decimal places.'
    else if (totalCents <= 0n) validationMessage = 'The total must be greater than zero.'
    else if (recipients.length === 0) validationMessage = 'Select at least one recipient team.'
    else if (totalCents < BigInt(recipients.length)) validationMessage = `The minimum total for ${recipients.length} ${recipients.length === 1 ? 'team' : 'teams'} is ${formatCents(BigInt(recipients.length))}.`
    else if (totalCents > balanceCents) validationMessage = `The total cannot exceed your balance of ${formatCents(balanceCents)}.`
  }
  const totalSummary = isValidTotal && totalCents !== null
    ? `Send ${formatCents(totalCents)} total to ${recipients.map((recipient) => recipient.name).join(', ')}.`
    : ''
  const preview = totalCents !== null && recipients.length > 0 && totalCents >= BigInt(recipients.length)
    ? recipients.map((recipient, index) => ({
      recipient,
      amount: totalCents / BigInt(recipients.length) + (BigInt(index) < totalCents % BigInt(recipients.length) ? 1n : 0n),
    }))
    : []
  const isTransferError = Boolean(action.error && action.variables?.action.type === 'money.transfer')
  const isDefiniteTransferError = isTransferError && isDefiniteActionError(action.error)
  const isUncertainTransferError = isTransferError && !isDefiniteTransferError
  const isPending = action.isPending
  const canTransfer = Boolean(team && view.isTeamLeader && view.allowedActions.includes('money.transfer'))
  const isClosed = view.status === 'finished'
  const isPausedForReveal = Boolean(view.reveal) || Boolean(
    view.isTeamLeader && view.status === 'playing' && balanceCents > 0n && !view.allowedActions.includes('money.transfer'),
  )

  function toggleRecipient(id: string, selected: boolean) {
    setRecipientIds((current) => selected
      ? [...new Set([...current, id])]
      : current.filter((candidate) => candidate !== id))
    setSuccessNotice('')
  }

  function selectAll() {
    setRecipientIds(otherTeams.map((candidate) => candidate.id))
    setSuccessNotice('')
  }

  function clearRecipients() {
    setRecipientIds([])
    setSuccessNotice('')
  }

  function changeTotal(value: string) {
    setTotal(value)
    setSuccessNotice('')
  }

  function send() {
    if (!canTransfer || isPending || isTransferError || !isValidTotal || totalCents === null) return
    submit({ type: 'money.transfer', recipientTeamIds: recipients.map((recipient) => recipient.id), amount: formatCents(totalCents) })
  }

  return {
    action,
    canTransfer,
    changeTotal,
    clearRecipients,
    isClosed,
    isDefiniteTransferError,
    isPausedForReveal,
    isPending,
    isTransferError,
    isUncertainTransferError,
    isValidTotal,
    otherTeams,
    preview,
    recipients,
    retry,
    selectAll,
    send,
    successNotice,
    team,
    total,
    totalSummary,
    toggleRecipient,
    validationMessage,
    editRejectedTransfer: () => action.reset(),
  }
}
