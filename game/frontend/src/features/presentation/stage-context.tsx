import { type ReactNode } from 'react'
import { usePresentationData, type PresentationScope } from './use-presentation-data'
import type { TeamDraft } from './stage-model'
import { useStageStorage } from './use-stage-storage'
import { PresentationContext } from './stage-state'

const emptyDraft: TeamDraft = []
function useStageState(scope: PresentationScope) {
  const state = usePresentationData(scope)
  const [draft, setDraft] = useStageStorage<TeamDraft>(`gtn-stage-teams:${state.data?.sessionId ?? 'none'}`, emptyDraft)
  return { state, draft, setDraft }
}
export function PresentationStageProvider({ children, mode, ...scope }: PresentationScope & { children: ReactNode; mode: 'host' | 'screen' }) {
  const stage = useStageState(scope)
  return <PresentationContext.Provider value={{ ...stage, mode }}>{children}</PresentationContext.Provider>
}
