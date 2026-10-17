import type { GameId } from 'backend/game'

export const GAME_ORDER: GameId[] = ['bonus', 'high-low', 'cave', 'circle', 'bomb']
export const gameNames: Record<GameId, string> = {
  bonus: 'Will we get a bonus this year?', 'high-low': 'High or low', cave: 'Cave mining',
  circle: 'What goes around comes around', bomb: 'Gamble bomb',
}
export function parseMoney(value: string): bigint | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,2}))?$/)
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : null
}
export function moneyUnits(value: bigint) {
  const abs = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`
}
export function formatMoney(value: string) {
  const [whole, fraction] = value.split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction === undefined ? '' : `.${fraction}`}`
}
export function withinMoney(value: string, limit: string) {
  const amount = parseMoney(value), maximum = parseMoney(limit)
  return amount !== null && maximum !== null && amount <= maximum
}
export const validCount = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
