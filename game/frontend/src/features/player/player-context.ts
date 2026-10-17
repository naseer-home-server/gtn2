import { createContext, useContext } from 'react'
import type { PlayerGameView } from 'backend/game'
import type { usePlayerGame } from '@/hooks/use-gameplay'
import type { useMoneyTransfer } from '@/hooks/use-money-transfer'

export type RoundDraft = {
  amount: string; pot: string; privatePot: string; money: string; stars: string
  returnMoney: string; returnStars: string; counts: Record<string, string>
}
export type Controller = ReturnType<typeof usePlayerGame>
export type PlayerSession = Controller & {
  view: PlayerGameView; draft: RoundDraft; updateDraft: (patch: Partial<RoundDraft>) => void
  transfer: ReturnType<typeof useMoneyTransfer>
}
export const Context = createContext<PlayerSession | null>(null)

export function usePlayerSession() {
  const value = useContext(Context)
  if (!value) throw new Error('Player screens require a player session.')
  return value
}
