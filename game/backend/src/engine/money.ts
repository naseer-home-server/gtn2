import type { Money, MoneyInput } from './types.js'
import { GameRuleError } from './errors.js'

function decimal(value: MoneyInput): [bigint, bigint] {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new GameRuleError('Money must be finite.')
  const match = String(value).match(/^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  if (!match || String(value).length > 1000) throw new GameRuleError('Invalid money amount.')
  const fraction = match[3] ?? ''
  const exponent = Number(match[4] ?? 0) - fraction.length
  if (Math.abs(exponent) > 1000) throw new GameRuleError('Invalid money amount.')
  const coefficient = BigInt(`${match[1] === '-' ? '-' : ''}${match[2]}${fraction}`)
  return exponent >= 0 ? [coefficient * 10n ** BigInt(exponent), 1n] : [coefficient, 10n ** BigInt(-exponent)]
}
function rounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new GameRuleError('Multiplier must be positive.')
  const sign = numerator < 0n ? -1n : 1n
  const value = numerator * sign
  return sign * ((value + denominator / 2n) / denominator)
}
export function cents(value: MoneyInput): Money {
  const [n, d] = decimal(value)
  if (n < 0n) throw new GameRuleError('Money must be nonnegative.')
  return rounded(n * 100n, d).toString()
}
export function units(value: Money): string {
  const n = BigInt(value); const sign = n < 0n ? '-' : ''; const abs = n < 0n ? -n : n
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`
}
export function moneyAdd(...values: Money[]): Money { return values.reduce((sum, value) => sum + BigInt(value), 0n).toString() }
export function moneySub(a: Money, b: Money): Money { return (BigInt(a) - BigInt(b)).toString() }
export function moneyCompare(a: Money, b: Money): number { return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0 }
export function moneyMultiply(value: Money, multiplier: number): Money { const [n, d] = decimal(multiplier); if (n < 0n) throw new GameRuleError('Invalid multiplier.'); return rounded(BigInt(value) * n, d).toString() }
export function moneyDivide(value: Money, divisor: number): Money { const [n, d] = decimal(divisor); return rounded(BigInt(value) * d, n).toString() }
export function moneyScale(value: Money, multiplier: number, divisor: number): Money {
  const [mn, md] = decimal(multiplier); const [dn, dd] = decimal(divisor)
  if (mn < 0n) throw new GameRuleError('Invalid multiplier.')
  return rounded(BigInt(value) * mn * dd, md * dn).toString()
}
export function moneyMultiplyMany(value: Money, ...multipliers: number[]): Money {
  let numerator = BigInt(value); let denominator = 1n
  for (const multiplier of multipliers) { const [n, d] = decimal(multiplier); if (n < 0n) throw new GameRuleError('Invalid multiplier.'); numerator *= n; denominator *= d }
  return rounded(numerator, denominator).toString()
}
export function moneyMin(...values: Money[]): Money { return values.reduce((a, b) => moneyCompare(a, b) < 0 ? a : b) }
export function safeMoney(value: Money): Money { if (!/^-?\d+$/.test(value) || BigInt(value) < 0n) throw new GameRuleError('Money must be nonnegative cents.'); return BigInt(value).toString() }
