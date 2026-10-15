import { z } from 'zod'
import { cents, gameActionSchema } from 'backend/engine'
import type { GameAction, PlayerGameView } from 'backend/game'

export class TurnValidationError extends Error {
  constructor(readonly issues: string[]) { super(issues.join('; ')); this.name = 'TurnValidationError' }
}

export function bombAllocationGuide(view: PlayerGameView) {
  if (!view.allowedActions.includes('bomb.allocate')) return undefined
  const min = view.roundState?.minChits ?? 1, max = view.roundState?.maxChits ?? 1
  const teamId = view.teams[0]?.id
  return {
    minTotalPerPile: min, maxTotalPerPile: max,
    directionPile: `${min} <= up + down <= ${max}. One combined pile; either count may be zero.`,
    recipientPile: `${min} <= sum(recipients values) <= ${max}. This is a separate pile, not one allowance per team.`,
    totalsMustMatch: false, recipientTeamIds: view.teams.map(team => team.id),
    example: teamId ? { type: 'bomb.allocate', up: Math.ceil(max / 2), down: Math.floor(max / 2), recipients: { [teamId]: max } } : undefined,
    exampleNote: 'Illustrative valid structure only; choose your own direction weights and recipients.',
  }
}

export function actionSchemas(view: PlayerGameView, decision: boolean) {
  return gameActionSchema.options
    .filter(schema => decision && schema.shape.type.value !== 'reveal.acknowledge' && view.allowedActions.includes(schema.shape.type.value))
    .map(schema => {
      const json = z.toJSONSchema(schema)
      if (schema.shape.type.value !== 'bomb.allocate') return json
      const guide = bombAllocationGuide(view)!
      const property = (name: string) => {
        const value = json.properties?.[name]
        return typeof value === 'object' && value !== null ? value : {}
      }
      const properties: NonNullable<typeof json.properties> = { ...json.properties }
      properties.up = { ...property('up'), maximum: guide.maxTotalPerPile, description: 'Up chits in the combined direction pile; up + down must fit the total limit.' }
      properties.down = { ...property('down'), maximum: guide.maxTotalPerPile, description: 'Down chits in the same direction pile; this is not a second allowance.' }
      properties.recipients = { ...property('recipients'), description: guide.recipientPile,
        propertyNames: { enum: guide.recipientTeamIds }, additionalProperties: { type: 'integer', minimum: 0, maximum: guide.maxTotalPerPile } }
      return { ...json, description: `Two independent piles. ${guide.directionPile} ${guide.recipientPile} Totals need not match.`,
        properties, examples: guide.example ? [guide.example] : [] }
    })
}

// Validate only information already available to this player. The game API remains authoritative.
export function validatePlayerAction(value: unknown, view: PlayerGameView, decision: boolean): GameAction {
  const parsed = gameActionSchema.safeParse(value)
  if (!parsed.success) throw new TurnValidationError(parsed.error.issues.map(issue => `actionJson.${issue.path.join('.') || 'type'}: ${issue.message}`))
  const action = parsed.data
  if (!decision) throw new TurnValidationError(['This is a discussion-only beat. actionJson must be null.'])
  if (action.type === 'reveal.acknowledge' || !view.allowedActions.includes(action.type)) {
    throw new TurnValidationError([`Action ${action.type} is unavailable. Allowed actions: ${view.allowedActions.filter(type => type !== 'reveal.acknowledge').join(', ') || 'none'}.`])
  }
  const require = (ok: boolean, message: string) => { if (!ok) throw new TurnValidationError([message]) }
  const money = (amount: string | number) => BigInt(cents(amount))
  const balance = money(view.team?.balance || '0')
  if (action.type === 'bonus.take' || action.type === 'high-low.choose') {
    require(money(action.amount) <= money(view.roundState?.choiceLimit || '0'), `amount must not exceed the choice limit ${view.roundState?.choiceLimit || '0.00'}.`)
  } else if (action.type === 'circle.send' || action.type === 'circle.return') {
    require(money(action.money) <= balance, `money must not exceed your balance ${view.team?.balance || '0.00'}.`)
    require(action.stars <= (view.team?.stars || 0), `stars must not exceed your ${view.team?.stars || 0} stars.`)
  } else if (action.type === 'bomb.allocate') {
    const min = view.roundState?.minChits || 1, max = view.roundState?.maxChits || 1
    require(Object.keys(action.recipients).every(id => view.teams.some(team => team.id === id)), 'recipients keys must be visible team IDs, not team names.')
    const directionTotal = action.up + action.down
    const recipientTotal = Object.values(action.recipients).reduce((sum, count) => sum + count, 0)
    const issues: string[] = []
    if (directionTotal < min || directionTotal > max) issues.push(`up + down must total between ${min} and ${max} chits. You submitted ${action.up} + ${action.down} = ${directionTotal}. Up and down share ONE direction pile; either may be zero. Choose your own split with a legal total.`)
    if (recipientTotal < min || recipientTotal > max) issues.push(`recipients must total between ${min} and ${max} chits. You submitted ${recipientTotal} across all recipient teams. This is ONE recipient pile, not a separate allowance per recipient.`)
    if (issues.length) throw new TurnValidationError(issues)
  } else if (action.type === 'pot.contribute') {
    const pot = action.scope === 'self' ? view.privatePot : view.pot
    require(Boolean(pot) && money(pot!.target) > 0n, 'The selected reveal pot is unavailable.')
    require(money(action.amount) > 0n, 'amount must be at least 0.01.')
    const remaining = money(pot!.target) - money(pot!.amount)
    require((money(action.amount) < remaining ? money(action.amount) : remaining) <= balance, `The contribution exceeds your balance ${view.team?.balance || '0.00'}.`)
  } else if (action.type === 'money.transfer') {
    require(action.recipientTeamIds.every(id => id !== view.team?.id && view.teams.some(team => team.id === id)), 'recipientTeamIds must identify other visible teams.')
    const amount = money(action.amount)
    require(amount > 0n && amount <= balance, `amount must be positive and within your balance ${view.team?.balance || '0.00'}.`)
    require(amount >= BigInt(action.recipientTeamIds.length), 'Provide at least 0.01 per recipient.')
    if (action.allocations) {
      require(action.allocations.length === action.recipientTeamIds.length && action.allocations.every(item => action.recipientTeamIds.includes(item.teamId)), 'Provide exactly one allocation for each selected recipient.')
      require(action.allocations.every(item => money(item.amount) > 0n), 'Each allocation must be at least 0.01.')
      require(action.allocations.reduce((sum, item) => sum + money(item.amount), 0n) === amount, 'allocations must add up to amount.')
    }
  }
  return action
}
