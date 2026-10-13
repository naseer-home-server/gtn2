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
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({})
  const [successNotice, setSuccessNotice] = useState('')
  const handledRequest = useRef<string | null>(null)

  useEffect(() => {
    setTotal('')
    setRecipientIds([])
    setAllocationAmounts({})
    setSuccessNotice('')
  }, [view.token])

  useEffect(() => {
    const command = action.variables
    if (!action.isSuccess || !command || command.action.type !== 'money.transfer' || handledRequest.current === command.requestId) return
    handledRequest.current = command.requestId
    setTotal('')
    setRecipientIds([])
    setAllocationAmounts({})
    const count = command.action.recipientTeamIds.length
    setSuccessNotice(`Shared ${formatCents(parseCents(String(command.action.amount)) ?? 0n)} among ${count} ${count === 1 ? 'team' : 'teams'}.`)
  }, [action.data, action.isSuccess, action.variables])

  const team = view.team
  const otherTeams = team ? view.teams.filter((candidate) => candidate.id !== team.id) : []
  const recipients = otherTeams.filter((candidate) => recipientIds.includes(candidate.id))
  const totalCents = parseCents(total)
  const balanceCents = parseCents(team?.balance ?? '0') ?? 0n
  const validTotalFormat = /^\d+(?:\.\d{1,2})?$/.test(total.trim())
  const parsedAllocations = recipients.map((recipient) => ({
    teamId: recipient.id,
    amount: allocationAmounts[recipient.id] ?? '',
    cents: parseCents(allocationAmounts[recipient.id] ?? ''),
  }))
  const allocatedCents = parsedAllocations.every((allocation) => allocation.cents !== null)
    ? parsedAllocations.reduce((sum, allocation) => sum + allocation.cents!, 0n)
    : null
  const difference = totalCents !== null && allocatedCents !== null ? totalCents - allocatedCents : null
  const isValidTotal = validTotalFormat
    && totalCents !== null
    && totalCents > 0n
    && totalCents <= balanceCents
    && recipients.length > 0
    && parsedAllocations.every((allocation) => allocation.cents !== null && allocation.cents > 0n)
    && allocatedCents === totalCents
  let validationMessage = ''
  if (total.trim()) {
    if (!validTotalFormat || totalCents === null) validationMessage = 'Enter a positive total with no more than two decimal places.'
    else if (totalCents <= 0n) validationMessage = 'The total must be greater than zero.'
    else if (recipients.length === 0) validationMessage = 'Select at least one recipient team.'
    else if (totalCents > balanceCents) validationMessage = `The total cannot exceed your balance of ${formatCents(balanceCents)}.`
    else if (parsedAllocations.some((allocation) => allocation.cents === null)) validationMessage = 'Enter an amount with no more than two decimal places for each team.'
    else if (parsedAllocations.some((allocation) => allocation.cents! <= 0n)) validationMessage = 'Each team must receive at least $0.01.'
    else if (difference !== null && difference !== 0n) validationMessage = difference > 0n
      ? `${formatCents(difference)} remains unassigned. Adjust the team amounts to match your total.`
      : `Recipient amounts exceed your total by ${formatCents(-difference)}.`
  }
  const totalSummary = isValidTotal && totalCents !== null
    ? `${formatCents(totalCents)} is fully assigned across ${recipients.length} ${recipients.length === 1 ? 'team' : 'teams'}.`
    : ''
  const preview = recipients.map((recipient) => ({ recipient, amount: allocationAmounts[recipient.id] ?? '' }))
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
    const nextIds = otherTeams.filter((candidate) => selected
      ? recipientIds.includes(candidate.id) || candidate.id === id
      : recipientIds.includes(candidate.id) && candidate.id !== id).map((candidate) => candidate.id)
    setRecipientIds(nextIds)
    setAllocationAmounts(equalAllocations(totalCents, nextIds))
    setSuccessNotice('')
  }

  function selectAll() {
    const nextIds = otherTeams.map((candidate) => candidate.id)
    setRecipientIds(nextIds)
    setAllocationAmounts(equalAllocations(totalCents, nextIds))
    setSuccessNotice('')
  }

  function clearRecipients() {
    setRecipientIds([])
    setAllocationAmounts({})
    setSuccessNotice('')
  }

  function changeTotal(value: string) {
    setTotal(value)
    setAllocationAmounts(equalAllocations(parseCents(value), recipientIds))
    setSuccessNotice('')
  }

  function send() {
    if (!canTransfer || isPending || isTransferError || !isValidTotal || totalCents === null) return
    submit({
      type: 'money.transfer',
      recipientTeamIds: parsedAllocations.map((allocation) => allocation.teamId),
      allocations: parsedAllocations.map((allocation) => ({ teamId: allocation.teamId, amount: allocation.amount })),
      amount: formatCents(totalCents),
    })
  }

  return {
    action,
    allocationAmounts,
    changeAllocation: (id: string, value: string) => setAllocationAmounts((current) => ({ ...current, [id]: value })),
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

function equalAllocations(total: bigint | null, recipientIds: string[]): Record<string, string> {
  if (total === null || recipientIds.length === 0) return {}
  const count = BigInt(recipientIds.length)
  const base = total / count
  const remainder = total % count
  return Object.fromEntries(recipientIds.map((id, index) => [
    id,
    formatCents(base + (BigInt(index) < remainder ? 1n : 0n)),
  ]))
}
