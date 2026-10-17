import { useContext } from 'react'
import { PresentationContext } from './stage-state'
export function usePresentationStage() {
  const value = useContext(PresentationContext)
  if (!value) throw new Error('PresentationStageProvider is required.')
  return value
}
