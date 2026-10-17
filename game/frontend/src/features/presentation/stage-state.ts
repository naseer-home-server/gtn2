import { createContext } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { PresentationState } from 'backend/presentation'
import type { TeamDraft } from './stage-model'
export type StageContext = { state: UseQueryResult<PresentationState | null, Error>; draft: TeamDraft; setDraft: (draft: TeamDraft) => void; mode: 'host' | 'screen' }
export const PresentationContext = createContext<StageContext | null>(null)
