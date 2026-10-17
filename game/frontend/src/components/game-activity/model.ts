import type { GameId } from 'backend/game'

export const gameNames: Record<GameId, string> = {
  bonus: 'Bonus', 'high-low': 'High or low', cave: 'Cave mining', circle: 'Circle', bomb: 'Gamble bomb',
}
export type AuditEvent = {
  id?: string; sequence?: number; type: string; data?: Record<string, unknown>
  createdAt?: string; game?: GameId; round?: number
}
export type ReviewTeam = { id: string; name: string; balance?: string; stars?: number; rank?: number }
export type ActivityMetric = { label: string; value: string; detail?: string; tone?: 'positive' | 'negative'; teamId?: string }
export type GameActivity = {
  id: string; game?: GameId; round?: number; time?: string; teamId?: string
  kind: 'choice' | 'outcome' | 'pot' | 'transfer' | 'stars' | 'cave' | 'reveal' | 'reset'
  title: string; metrics: ActivityMetric[]; note?: string; progress?: number
}
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const validGame = (value: unknown): value is GameId => typeof value === 'string' && value in gameNames
const eventGame = (event: AuditEvent) => validGame(event.data?.game) ? event.data.game : event.game ?? Object.keys(gameNames).find(game => event.type.startsWith(`${game}.`)) as GameId | undefined

export function moneyCents(value: unknown, signed = false): string {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return '—'
  const n = BigInt(value), abs = n < 0n ? -n : n
  return `${n < 0n ? '−' : signed && n > 0n ? '+' : ''}${(abs / 100n).toLocaleString('en-US')}.${String(abs % 100n).padStart(2, '0')}`
}
export function unitsToCents(value: unknown): string | undefined {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value ?? ''))
  if (!match) return undefined
  const fraction = match[3] || ''
  const n = BigInt(match[2]!) * 100n + BigInt((fraction + '00').slice(0, 2)) + (Number(fraction[2] || '0') >= 5 ? 1n : 0n)
  return (match[1] ? -n : n).toString()
}
const units = (value: unknown) => moneyCents(unitsToCents(value))
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
const textId = (value: unknown) => typeof value === 'string' ? value : undefined
const configMoneyKeys = new Set(['bag', 'threshold', 'pool', 'startingMoney'])

function configValue(key: string, value: unknown): string {
  const values = Array.isArray(value) ? value : [value]
  const formatted = values.map(item => {
    if (configMoneyKeys.has(key)) return units(item)
    if (key === 'collapseRisk') return `${item}%`
    if (['multiplier', 'growth', 'factor'].includes(key)) return `×${String(item)}`
    if (key === 'tickSeconds') return `${String(item)}s`
    return String(item)
  })
  return formatted.join(' / ')
}

function configLabel(key: string): string {
  const labels: Record<string, string> = {
    bag: 'Bag amounts', threshold: 'Thresholds', pool: 'Pools', startingMoney: 'Starting money',
    multiplier: 'Multipliers', growth: 'Growth', collapseRisk: 'Collapse risk', tickSeconds: 'Tick interval',
    maxTicks: 'Maximum ticks', stars: 'Stars', factor: 'Bomb factor', minChits: 'Minimum chits',
    maxChits: 'Standard chits', advantageChits: 'Advantaged chits',
  }
  return labels[key] ?? key.replace(/[A-Z]/g, character => ` ${character.toLowerCase()}`).replace(/^./, character => character.toUpperCase())
}

// Project the audit into gameplay only. The unabridged audit remains available to the server/export.
export function gameActivities(input: AuditEvent[], teams: ReviewTeam[]): GameActivity[] {
  const name = (id: string) => teams.find(team => team.id === id)?.name || id
  let game: GameId | undefined, round: number | undefined
  const located = input.map((event, index) => {
    const nextGame = eventGame(event)
    if (nextGame && nextGame !== game) { game = nextGame; round = undefined }
    const nextRound = event.type === 'game.reset' ? 1 : numeric(event.data?.round) ?? event.round
    if (nextRound !== undefined) round = nextRound
    return { ...event, game, round, id: event.id || `engine-${event.sequence ?? index}` }
  })
  const revisionKey = (event: AuditEvent) => event.data?.revision !== undefined ? `r${event.data.revision}` : `${event.game}:${event.round}`
  const commands = new Set(located.filter(event => event.type === 'player.command').map(event => `${revisionKey(event)}:${event.data?.teamId}`))
  const completed = new Set(located.filter(event => event.type === 'round.completed').map(revisionKey))
  return located.flatMap<GameActivity>(event => {
    const data = event.data || {}, key = revisionKey(event)
    const base = { id: event.id, game: event.game, round: event.round, time: event.createdAt, teamId: textId(data.teamId) }
    const metric = (label: string, value: string): ActivityMetric => ({ label, value })
    const payouts = Object.entries(record(data.payouts)).map(([teamId, value]) => ({
      label: name(teamId), value: moneyCents(value, true), teamId,
      detail: typeof record(data.netStars)[teamId] === 'number' ? `${Number(record(data.netStars)[teamId]) > 0 ? '+' : ''}${record(data.netStars)[teamId]} ★` : undefined,
      tone: String(value).startsWith('-') ? 'negative' as const : 'positive' as const,
    }))
    if (event.type === 'player.command') {
      const action = record(data.action), type = action.type
      if (type === 'bonus.take' || type === 'high-low.choose') return [{ ...base, kind: 'choice', title: type === 'bonus.take' ? 'Take from bag' : 'Amount chosen', metrics: [metric('Choice', units(action.amount))] }]
      if (type === 'cave.decide') {
        const earning = located.find(item => item.type === 'cave.earnings' && revisionKey(item) === key && item.data?.teamId === data.teamId)
        const decision = located.find(item => item.type === 'cave.decision' && revisionKey(item) === key && item.data?.teamId === data.teamId)
        return [{ ...base, kind: 'choice', title: action.decision === 'leave' ? 'Leave & bank' : 'Stay in cave',
          metrics: [...(decision?.data?.tick !== undefined ? [metric('Tick', String(decision.data.tick))] : []), ...(earning ? [metric('Banked', moneyCents(earning.data?.amount))] : [])] }]
      }
      if (type === 'circle.send' || type === 'circle.return') return [{ ...base, kind: 'transfer', title: type === 'circle.send' ? 'Send around circle' : 'Return to sender', metrics: [metric('Money', units(action.money)), metric('Stars', `★ ${action.stars}`)] }]
      if (type === 'bomb.allocate') return [{ ...base, kind: 'choice', title: 'Chits allocated', metrics: [
        metric('↑ Up', String(action.up)), metric('↓ Down', String(action.down)),
        ...Object.entries(record(action.recipients)).filter(([, count]) => Number(count) > 0).map(([id, count]) => ({ label: name(id), value: `${count} chits`, teamId: id })),
      ] }]
      return [] // Pot/transfer receipts carry the actual applied amounts; reveal acknowledgments are noise.
    }
    if (['bonus.choice', 'high-low.choice', 'cave.decision'].includes(event.type)) {
      if (commands.has(`${key}:${data.teamId}`)) return []
      return [{ ...base, kind: 'choice', title: event.type === 'cave.decision' ? `${data.decision === 'leave' ? 'Leave' : 'Stay'} in cave` : 'Amount chosen', metrics: event.type === 'cave.decision' ? [metric('Tick', String(data.tick))] : [metric('Choice', moneyCents(data.amount))] }]
    }
    if (event.type === 'cave.earnings') {
      if (commands.has(`${key}:${data.teamId}`)) return []
      return [{ ...base, kind: 'cave', title: 'Banked safely', metrics: [metric('Banked', moneyCents(data.amount)), metric('Tick', String(data.tick))] }]
    }
    if (event.type === 'cave.default_stay') return [{ ...base, kind: 'choice', title: 'Stayed · no response', metrics: [metric('Tick', String(data.tick))] }]
    if (event.type === 'cave.survived') return [{ ...base, kind: 'cave', title: 'Cave survived', metrics: [metric('Tick', String(data.tick)), metric('Unbanked / team', moneyCents(data.unbanked)), metric('Collapse risk', `${data.risk}%`)] }]
    if (event.type === 'pot.contributed') return [{ ...base, kind: 'pot', title: `${data.scope === 'self' ? 'Private' : 'Public'} reveal pot`, metrics: [metric('Contribution', moneyCents(data.amount)), metric('Pot', `${moneyCents(data.total)} / ${moneyCents(data.target)}`)], progress: Number(data.target) > 0 ? Math.min(1, Number(data.total) / Number(data.target)) : undefined }]
    if (event.type === 'money.transferred') return [{ ...base, teamId: textId(data.fromTeamId), kind: 'transfer', title: 'Money transfer', metrics: [metric('Sent', moneyCents(data.amount)), metric('→ To', name(String(data.toTeamId)))] }]
    if (event.type === 'team.account_adjusted') {
      const before = record(data.before), after = record(data.after)
      return [{ ...base, kind: 'stars', title: 'Account adjusted', metrics: [
        metric('Balance before', moneyCents(before.balance)), metric('Balance after', moneyCents(after.balance)),
        metric('Stars before', `★ ${String(before.stars ?? '—')}`), metric('Stars after', `★ ${String(after.stars ?? '—')}`),
      ], note: typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim() : undefined }]
    }
    if (event.type === 'config.updated') {
      const configGame = validGame(data.game) ? data.game : event.game
      const settings = record(data.settings)
      const metrics = Object.entries(settings).map(([key, value]) => metric(configLabel(key), configValue(key, value)))
      if (typeof data.revealPotMultiplier === 'number' && Number.isFinite(data.revealPotMultiplier)) {
        metrics.push(metric('Reveal price', `×${data.revealPotMultiplier}`))
      }
      return [{ ...base, game: configGame, teamId: undefined, kind: 'choice', title: 'Game settings applied', metrics,
        note: configGame ? `${gameNames[configGame]} settings are effective for this game.` : 'Updated game settings are effective for this game.' }]
    }
    if (event.type === 'stars.awarded') return [{ ...base, kind: 'stars', title: 'Stars awarded', metrics: [metric('Award', `★ ${data.count}`)] }]
    if (event.type === 'private-rank.revealed' || event.type === 'rankings.revealed') return [{ ...base, kind: 'reveal', title: event.type === 'private-rank.revealed' ? 'Private rank revealed' : 'Public ranks revealed', metrics: event.type === 'private-rank.revealed' ? [metric('Rank', `#${data.rank}`)] : (Array.isArray(data.rankings) ? data.rankings : []).map(value => { const ranking = record(value); return metric(name(String(ranking.teamId)), `#${ranking.rank}`) }) }]
    if (event.type === 'game.reset') return [{ ...base, kind: 'reset', title: 'Game restarted', metrics: [], note: 'This game’s earlier results have been reset.' }]
    if (event.type === 'round.completed' || ['bonus.resolved', 'high-low.resolved', 'cave.ended', 'bomb.resolved'].includes(event.type) && !completed.has(key)) {
      const outcome = event.type === 'bomb.resolved' ? data : record(data.outcome)
      let title = 'Round result'
      let metrics: ActivityMetric[] = []
      if (event.game === 'bonus') metrics = [metric('Total taken', moneyCents(data.totalTaken)), metric('Threshold bonus', `×${data.thresholdBonus}`), metric('Zero-taker bonus', `×${data.zeroTakers}`)]
      if (event.game === 'high-low') metrics = [metric('Winner', name(String(data.winner))), metric('Lowest', moneyCents(data.lowest)), metric('Highest', moneyCents(data.highest))]
      if (event.game === 'cave') { title = data.reason === 'collapsed' ? 'Cave collapsed' : 'Everyone banked'; metrics = [metric('Final tick', String(data.tick))] }
      if (event.game === 'bomb') {
        title = outcome.direction === 'up' ? 'Bomb · balance multiplied' : 'Bomb · balance divided'
        metrics = [metric('Recipient', name(String(outcome.teamId))), metric('Factor', `${outcome.direction === 'up' ? '×' : '÷'}${outcome.factor}`), metric('Before', units(outcome.before)), metric('After', units(outcome.after))]
      }
      return [{ ...base, teamId: undefined, kind: 'outcome', title, metrics: [...metrics, ...payouts] }]
    }
    return [] // Submission echoes, setup/control bookkeeping, and unknown internal events stay out of the feed.
  })
}
