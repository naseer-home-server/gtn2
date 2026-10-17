import { useEffect, useState, type ReactNode } from 'react'
import type { PlayerGameView } from 'backend/game'
import { usePlayerGame } from '@/hooks/use-gameplay'
import { useMoneyTransfer } from '@/hooks/use-money-transfer'
import { Context, type Controller, type RoundDraft } from './player-context'
import { ErrorMessage, LoadingMessage } from '@/components/page-feedback'

const emptyDraft = (): RoundDraft => ({ amount: '0', pot: '0', privatePot: '0', money: '0', stars: '0', returnMoney: '0', returnStars: '0', counts: {} })

export function PlayerSessionProvider({ sessionId, playerId, children }: { sessionId: string; playerId: string; children: ReactNode }) {
  const game = usePlayerGame({ sessionId, playerId })
  // Background errors must not unmount the controller and lose an uncertain request.
  if (!game.state.data) return <main id="main-content" className="player-main">{game.state.error ? <ErrorMessage message={game.state.error.message} /> : <LoadingMessage />}</main>
  return <ReadySession game={game} view={game.state.data}>{children}</ReadySession>
}
function ReadySession({ game, view, children }: { game: Controller; view: PlayerGameView; children: ReactNode }) {
  const [saved, setSaved] = useState({ token: view.token, draft: emptyDraft() })
  const draft = saved.token === view.token ? saved.draft : emptyDraft()
  useEffect(() => { setSaved({ token: view.token, draft: emptyDraft() }) }, [view.token])
  const transfer = useMoneyTransfer(view, game.action, game.submit, game.retry)
  const updateDraft = (patch: Partial<RoundDraft>) => setSaved(previous => ({
    token: view.token, draft: { ...(previous.token === view.token ? previous.draft : emptyDraft()), ...patch },
  }))
  return <Context.Provider value={{ ...game, view, draft, updateDraft, transfer }}>{children}</Context.Provider>
}
