import type { EngineState } from './types.js'

export function isStarTransferOpen(state: EngineState): boolean {
  return state.status === 'playing' && state.reveal === null && (
    (state.current.game === 'circle' && state.current.phase === 'complete' && state.round === 3)
    || (state.current.game === 'bomb' && state.round === 1 && state.current.phase === 'ready' && state.advantagedTeamId === null)
  )
}
