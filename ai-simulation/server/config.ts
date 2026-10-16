import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { DEFAULT_CONFIG, MIN_TEAMS, MAX_TEAMS } from 'backend/engine'
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
  hostMaxOutputTokens: Number(process.env.SIM_HOST_MAX_OUTPUT_TOKENS || 0),
  playerMaxOutputTokens: Number(process.env.SIM_PLAYER_MAX_OUTPUT_TOKENS || 0),
  hostContextTokens: Number(process.env.SIM_HOST_CONTEXT_TOKENS || 0),
  playerContextTokens: Number(process.env.SIM_PLAYER_CONTEXT_TOKENS || 0),
}
export const defaultOptions: RunOptions = {
  teamCount: 5, seed: 20261014, mode: 'scripted', hostModel: providerConfig.hostModel,
  playerModel: providerConfig.playerModel, hostReasoningEffort: 'high', playerReasoningEffort: 'high', minDiscussionBeats: 2, maxDiscussionBeats: 4,
  caveDiscussionBeats: 1, maxSteps: 200, maxWallTimeMs: 30 * 60 * 1000,
  maxToolAttempts: 3,
  hostContextTokens: providerConfig.hostContextTokens, playerContextTokens: providerConfig.playerContextTokens,
}
export const defaults = structuredClone(DEFAULT_CONFIG)

export function validateOptions(options: Partial<RunOptions>): RunOptions {
  const { maxTokens: _legacyTokenBudget, ...currentOptions } = options as Partial<RunOptions> & { maxTokens?: unknown }
  const result = { ...defaultOptions, ...currentOptions }
  if (!Number.isInteger(result.teamCount) || result.teamCount < MIN_TEAMS || result.teamCount > MAX_TEAMS) throw new Error(`teamCount must be between ${MIN_TEAMS} and ${MAX_TEAMS}`)
  if (!Number.isInteger(result.seed) || result.seed < 0) throw new Error('seed must be a non-negative integer')
  if (!['scripted', 'openai'].includes(result.mode)) throw new Error('mode must be scripted or openai')
  for (const field of ['hostReasoningEffort', 'playerReasoningEffort'] as const) {
    if (!['low', 'medium', 'high', 'xhigh'].includes(result[field])) throw new Error(field + ' must be low, medium, high, or xhigh')
  }
  for (const field of ['hostContextTokens', 'playerContextTokens'] as const) {
    if (!Number.isSafeInteger(result[field]) || result[field] < 0 || result[field] > 10_000_000) throw new Error(field + ' must be 0 (automatic) or a context window up to 10,000,000 tokens')
  }
  if (!Number.isInteger(result.maxToolAttempts) || result.maxToolAttempts < 1 || result.maxToolAttempts > 10) throw new Error('maxToolAttempts must be from 1 to 10 (including the initial attempt)')
  if (!Number.isInteger(result.minDiscussionBeats) || result.minDiscussionBeats < 0 || result.minDiscussionBeats > 20) throw new Error('minDiscussionBeats must be from 0 to 20')
  if (!Number.isInteger(result.maxDiscussionBeats) || result.maxDiscussionBeats < result.minDiscussionBeats || result.maxDiscussionBeats > 20) throw new Error('maxDiscussionBeats must be at least minDiscussionBeats and at most 20')
  if (!Number.isInteger(result.caveDiscussionBeats) || result.caveDiscussionBeats < 0 || result.caveDiscussionBeats > 5) throw new Error('caveDiscussionBeats must be from 0 to 5')
  if (!Number.isInteger(result.maxSteps) || result.maxSteps < 1 || result.maxSteps > 10000) throw new Error('maxSteps must be from 1 to 10,000')
  if (!Number.isInteger(result.maxWallTimeMs) || result.maxWallTimeMs < 1000 || result.maxWallTimeMs > 24 * 60 * 60 * 1000) throw new Error('maxWallTimeMs must be from 1 second to 24 hours')
  if (result.mode === 'openai' && (!providerConfig.apiKey || !result.playerModel || !result.hostModel)) throw new Error('OpenAI mode requires OPENAI_API_KEY, hostModel, and playerModel')
  return result
}
