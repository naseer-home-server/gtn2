const MAX_SAFE_STARS = BigInt(Number.MAX_SAFE_INTEGER)
const MAX_MONEY_INPUT_LENGTH = 1_000

function currencyFromCents(value: string) {
  if (!/^\d+$/.test(value)) return '0.00'
  const cents = BigInt(value)
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}

function formatCents(value: string) {
  if (!/^\d+$/.test(value)) return '0.00'
  const cents = BigInt(value)
  const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(cents / 100n)
  return `${whole}.${String(cents % 100n).padStart(2, '0')}`
}

function parseCurrency(value: string): { cents: bigint; normalized: string } | null {
  const trimmed = value.trim()
  if (trimmed.length > MAX_MONEY_INPUT_LENGTH) return null
  const match = trimmed.match(/^(\d+)(?:\.(\d{0,2}))?$/)
  if (!match) return null
  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  const cents = whole * 100n + fraction
  const normalized = `${whole}.${String(fraction).padStart(2, '0')}`
  if (normalized.length > MAX_MONEY_INPUT_LENGTH) return null
  return { cents, normalized }
}

function parseStars(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const stars = BigInt(value.trim())
  if (stars > MAX_SAFE_STARS) return null
  return Number(stars)
}

export { currencyFromCents, formatCents as formatTeamBalance, parseCurrency as parseAccountBalance, parseStars as parseAccountStars }
