import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { DEFAULT_CONFIG } from 'backend/engine'
import type { RunOptions } from './types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(here, '../.env') })
export const dataDir = process.env.SIMULATION_DATA_DIR || path.resolve(here, '../data')
export const publicDir = process.env.SIMULATION_PUBLIC_DIR || path.resolve(here, '../frontend/dist')
export const gameApiBaseUrl = (process.env.GAME_API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
export const serviceKey = process.env.SIMULATION_SERVICE_KEY || ''
export const operatorToken = process.env.SIMULATION_OPERATOR_TOKEN || ''
export const providerConfig = {
  baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  apiKey: process.env.OPENAI_API_KEY || '',
  hostModel: process.env.SIM_HOST_MODEL || '', playerModel: process.env.SIM_PLAYER_MODEL || '',
  concurrency: Math.max(1, Number(process.env.SIM_MAX_CONCURRENCY || 5)),
  maxOutputTokens: Math.max(128, Number(process.env.SIM_MAX_OUTPUT_TOKENS || 1200)),
  maxTotalTokens: Math.max(1000, Number(process.env.SIM_MAX_TOTAL_TOKENS || 250000)),
}
export const defaultOptions: RunOptions = {
  teamCount: 5, seed: 20261014, mode: 'scripted', hostModel: providerConfig.hostModel,
  playerModel: providerConfig.playerModel, minDiscussionBeats: 2, maxDiscussionBeats: 4,
  caveDiscussionBeats: 1, maxTokens: 250000, maxSteps: 200, maxWallTimeMs: 30 * 60 * 1000,
}
export const defaults = structuredClone(DEFAULT_CONFIG)

export function validateOptions(options: Partial<RunOptions>): RunOptions {
  const result = { ...defaultOptions, ...options }
  if (!Number.isInteger(result.teamCount) || result.teamCount < 2 || result.teamCount > 5) throw new Error('teamCount must be between 2 and 5')
  if (!Number.isInteger(result.seed) || result.seed < 0) throw new Error('seed must be a non-negative integer')
  if (!['scripted', 'openai'].includes(result.mode)) throw new Error('mode must be scripted or openai')
  if (!Number.isInteger(result.minDiscussionBeats) || result.minDiscussionBeats < 0 || result.minDiscussionBeats > 20) throw new Error('minDiscussionBeats must be from 0 to 20')
  if (!Number.isInteger(result.maxDiscussionBeats) || result.maxDiscussionBeats < result.minDiscussionBeats || result.maxDiscussionBeats > 20) throw new Error('maxDiscussionBeats must be at least minDiscussionBeats and at most 20')
  if (!Number.isInteger(result.caveDiscussionBeats) || result.caveDiscussionBeats < 0 || result.caveDiscussionBeats > 5) throw new Error('caveDiscussionBeats must be from 0 to 5')
  if (!Number.isInteger(result.maxTokens) || result.maxTokens < 100 || result.maxTokens > 5_000_000) throw new Error('maxTokens must be from 100 to 5,000,000')
  if (!Number.isInteger(result.maxSteps) || result.maxSteps < 1 || result.maxSteps > 10000) throw new Error('maxSteps must be from 1 to 10,000')
  if (!Number.isInteger(result.maxWallTimeMs) || result.maxWallTimeMs < 1000 || result.maxWallTimeMs > 24 * 60 * 60 * 1000) throw new Error('maxWallTimeMs must be from 1 second to 24 hours')
  if (result.mode === 'openai' && (!providerConfig.apiKey || !result.playerModel || !result.hostModel)) throw new Error('OpenAI mode requires OPENAI_API_KEY, hostModel, and playerModel')
  return result
}
