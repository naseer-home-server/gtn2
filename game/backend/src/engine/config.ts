import { z } from 'zod'
import type { GameConfig } from './types.js'
import { MAX_TRANSFER_RECIPIENTS } from './limits.js'

const amount = z.number().finite().min(0).max(1e12)
const multiplier = z.number().finite().min(1).max(1e6)
const stars = z.number().int().min(0).max(1000)
const risk = z.number().min(0).max(100)
// Accept five-entry risk snapshots from saved runs and exported configurations.
const collapseRisk = z.union([z.tuple([risk, risk, risk, risk, risk, risk, risk]), z.tuple([risk, risk, risk, risk, risk])])
const triple = <T extends z.ZodType>(value: T) => z.tuple([value, value, value])
export const gameConfigSchema = z.object({
  initialBalance: amount,
  revealPotMultiplier: z.number().finite().positive().max(1000),
  bonus: z.object({ bag: triple(amount), threshold: triple(amount), multiplier: triple(multiplier), stars }),
  highLow: z.object({ pool: triple(amount), multiplier: triple(multiplier), stars }),
  cave: z.object({
    startingMoney: triple(amount), growth: triple(multiplier), tickSeconds: z.number().min(1).max(3600), maxTicks: z.number().int().min(1).max(1000).default(10),
    collapseRisk, stars
  }),
  circle: z.object({ multiplier: triple(z.number().int().min(1).max(1000)) }),
  bomb: z.object({ minChits: z.number().int().min(1).max(1000), maxChits: z.number().int().min(1).max(1000), advantageChits: z.number().int().min(1).max(1000), factor: triple(multiplier) })
    .refine((v) => v.minChits <= v.maxChits && v.maxChits <= v.advantageChits, 'Chit limits must be minimum ≤ standard ≤ advantage.'),
})
export const DEFAULT_CONFIG: GameConfig = {
  initialBalance: 0, revealPotMultiplier: 1,
  bonus: { bag: [100, 100, 100], threshold: [100, 100, 100], multiplier: [3, 5, 10], stars: 1 },
  highLow: { pool: [100, 100, 100], multiplier: [10, 50, 100], stars: 2 },
  cave: { startingMoney: [5, 5, 5], growth: [2, 3, 4], tickSeconds: 10, maxTicks: 10, collapseRisk: [5, 75, 80, 85, 90, 95, 100], stars: 3 },
  circle: { multiplier: [3, 5, 10] },
  bomb: { minChits: 1, maxChits: 20, advantageChits: 60, factor: [2, 5, 10] },
}
const moneyInput = z.union([z.number().finite().nonnegative(), z.string().max(1000).regex(/^\d+(\.\d+)?$/)])
export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bonus.take'), amount: moneyInput }),
  z.object({ type: z.literal('high-low.choose'), amount: moneyInput }),
  z.object({ type: z.literal('cave.decide'), decision: z.enum(['stay', 'leave']) }),
  z.object({ type: z.literal('circle.send'), money: moneyInput, stars: z.number().int().nonnegative() }),
  z.object({ type: z.literal('circle.return'), money: moneyInput, stars: z.number().int().nonnegative() }),
  z.object({ type: z.literal('bomb.allocate'), up: z.number().int().nonnegative(), down: z.number().int().nonnegative(), recipients: z.record(z.string().max(100), z.number().int().nonnegative()) }),
  z.object({ type: z.literal('pot.contribute'), amount: moneyInput, scope: z.enum(['self', 'public']).optional() }),
  z.object({
    type: z.literal('money.transfer'),
    recipientTeamIds: z.array(z.uuid()).min(1).max(MAX_TRANSFER_RECIPIENTS).refine((ids) => new Set(ids).size === ids.length, 'Choose each recipient team only once.'),
    amount: moneyInput,
    allocations: z.array(z.object({ teamId: z.uuid(), amount: moneyInput })).min(1).max(MAX_TRANSFER_RECIPIENTS)
      .refine((items) => new Set(items.map((item) => item.teamId)).size === items.length, 'Choose each recipient team only once.')
      .optional(),
  }),
  z.object({ type: z.literal('reveal.acknowledge') }),
])
export const playerCommandSchema = z.object({ requestId: z.uuid(), token: z.string().min(1).max(100), action: gameActionSchema })
