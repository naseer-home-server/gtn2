import type { GameConfig } from 'backend/game'
import type { RunDetail, RunEvent, RunOptions, RunSummary } from '../../server/types.js'

export type { GameConfig, RunDetail, RunEvent, RunOptions, RunSummary }

export type ConfigResponse = {
  defaults: GameConfig
  defaultsRun: RunOptions
  provider: { configured: boolean; hostModel: string; playerModel: string }
}
