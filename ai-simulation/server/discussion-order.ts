import { z } from 'zod'
import { TurnValidationError } from './validation.js'

export type DiscussionSwap = { firstPosition: number; secondPosition: number }
export type DiscussionTeam = { id: string; name: string }

export function assertDiscussionRoster(order: unknown, teamIds: readonly string[]): asserts order is string[] {
  if (!Array.isArray(order) || order.length !== teamIds.length || new Set(order).size !== teamIds.length
    || order.some(id => typeof id !== 'string' || !teamIds.includes(id))) {
    throw new Error('The speaking order must contain every current team exactly once.')
  }
}

export function discussionSwapsSchema(teamCount: number) {
  return z.object({
    swaps: z.array(z.object({
      firstPosition: z.number().int().min(1).max(teamCount),
      secondPosition: z.number().int().min(1).max(teamCount),
    }).strict().refine(swap => swap.firstPosition !== swap.secondPosition, {
      message: 'Choose two different positions for a swap.',
    })).max(Math.max(0, teamCount - 1)),
  }).strict()
}

export function parseDiscussionSwaps(value: unknown, teamCount: number): DiscussionSwap[] {
  const parsed = discussionSwapsSchema(teamCount).safeParse(value)
  if (!parsed.success) throw new TurnValidationError(parsed.error.issues.map(issue =>
    issue.path.join('.') + ': ' + issue.message))
  return parsed.data.swaps
}

export function applyDiscussionSwaps(initialOrder: readonly string[], swaps: readonly DiscussionSwap[]): string[] {
  if (!initialOrder.length || new Set(initialOrder).size !== initialOrder.length) {
    throw new Error('A discussion order must contain each team exactly once.')
  }
  const validated = parseDiscussionSwaps({ swaps }, initialOrder.length)
  const order = [...initialOrder]
  // Positions are one-based and each swap acts on the result of the previous swap.
  for (const { firstPosition, secondPosition } of validated) {
    const first = firstPosition - 1, second = secondPosition - 1
    ;[order[first], order[second]] = [order[second]!, order[first]!]
  }
  return order
}
