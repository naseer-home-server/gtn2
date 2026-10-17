import { useCallback, useEffect, useState } from 'react'
import { gameConfigSchema } from 'backend/engine'
import type { GameConfig, GameId } from 'backend/game'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  value: GameConfig
  onChange: (value: GameConfig) => void
  game?: GameId
  disabled?: boolean
  onValidityChange?: (valid: boolean) => void
}

type NumberFieldProps = {
  id: string
  label: string
  value: number
  onCommit: (value: number) => void
  min: number
  max: number
  minExclusive?: boolean
  integer?: boolean
  unit?: string
  disabled: boolean
  onFieldValidity?: (id: string, valid: boolean) => void
}

const gameLabels: Record<GameId, string> = {
  bonus: 'Will we get a bonus this year?',
  'high-low': 'High or low',
  cave: 'Cave mining',
  circle: 'What goes around comes around',
  bomb: 'Gamble bomb',
}

function validNumber(raw: string, min: number, max: number, integer: boolean, minExclusive = false) {
  if (!(integer ? /^\d+$/.test(raw) : /^\d+(?:\.\d+)?$/.test(raw))) return false
  const value = Number(raw)
  return Number.isFinite(value) && (!integer || Number.isSafeInteger(value)) && (minExclusive ? value > min : value >= min) && value <= max
}

function NumberField({ id, label, value, onCommit, min, max, minExclusive = false, integer = false, unit, disabled, onFieldValidity }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const raw = draft ?? String(value)
  const valid = validNumber(raw, min, max, integer, minExclusive)

  useEffect(() => { setDraft(null) }, [value])

  useEffect(() => {
    onFieldValidity?.(id, valid)
    return () => onFieldValidity?.(id, true)
  }, [id, valid, onFieldValidity])

  function change(next: string) {
    setDraft(next)
    if (validNumber(next, min, max, integer, minExclusive)) onCommit(Number(next))
  }

  return <div className="min-w-0 space-y-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <Label htmlFor={id} className="min-w-0 leading-snug">{label}</Label>
      {unit && <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>}
    </div>
    <Input id={id} type="text" inputMode={integer ? 'numeric' : 'decimal'} autoComplete="off" value={raw} disabled={disabled} aria-invalid={!valid} onChange={event => change(event.target.value)} className="h-10 tabular-nums" />
    {!valid && <p className="text-xs leading-snug text-destructive" role="alert">Enter a {integer ? 'whole number' : 'number'} {minExclusive ? 'greater than' : 'from'} {min}{minExclusive ? ` and no more than ${max}` : ` to ${max}`}.</p>}
  </div>
}

function NumberRow({ id, label, values, onCommit, min, max, integer, unit, disabled, onFieldValidity }: {
  id: string
  label: string
  values: [number, number, number]
  onCommit: (round: 0 | 1 | 2, value: number) => void
  min: number
  max: number
  integer?: boolean
  unit?: string
  disabled: boolean
  onFieldValidity?: (id: string, valid: boolean) => void
}) {
  return <fieldset className="min-w-0 border-t border-border py-3 first:border-t-0 first:pt-0">
    <legend className="mb-2 text-sm font-medium">{label}</legend>
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {values.map((value, round) => <NumberField key={round} id={`${id}-round-${round + 1}`} label={`Round ${round + 1}`} value={value} min={min} max={max} integer={integer} unit={unit} disabled={disabled} onCommit={next => onCommit(round as 0 | 1 | 2, next)} onFieldValidity={onFieldValidity} />)}
    </div>
  </fieldset>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
    <h3 className="font-heading text-xl leading-tight">{title}</h3>
    {children}
  </section>
}

export function GameConfigEditor({ value, onChange, game, disabled = false, onValidityChange }: Props) {
  const [invalidFields, setInvalidFields] = useState<Record<string, true>>({})

  const patch = (apply: (config: GameConfig) => void) => {
    const next = structuredClone(value)
    apply(next)
    onChange(next)
  }
  const fieldValidity = useCallback((id: string, fieldValid: boolean) => setInvalidFields(previous => {
    if (fieldValid && !(id in previous)) return previous
    if (!fieldValid && previous[id]) return previous
    const next = { ...previous }
    if (fieldValid) delete next[id]
    else next[id] = true
    return next
  }), [])
  const schemaValid = gameConfigSchema.safeParse(value).success
  const valid = schemaValid && Object.keys(invalidFields).length === 0

  useEffect(() => { onValidityChange?.(valid) }, [valid, onValidityChange])

  const renderRoundRow = (id: string, label: string, values: [number, number, number], update: (round: 0 | 1 | 2, next: number) => void, range: { min: number; max: number; integer?: boolean; unit?: string }) => <NumberRow key={`${game ?? 'all'}-${id}`} id={`${game ?? 'all'}-${id}`} label={label} values={values} min={range.min} max={range.max} integer={range.integer} unit={range.unit} disabled={disabled} onCommit={update} onFieldValidity={fieldValidity} />

  const editTriple = <T extends 'bonus' | 'highLow' | 'cave' | 'circle' | 'bomb'>(section: T, field: keyof GameConfig[T], round: 0 | 1 | 2, next: number) => patch(config => {
    const target = config[section] as unknown as Record<string, unknown>
    const triple = [...target[field as string] as number[]]
    triple[round] = next
    target[field as string] = triple
  })
  const editScalar = <T extends 'bonus' | 'highLow' | 'cave'>(section: T, field: keyof GameConfig[T], next: number) => patch(config => {
    ;(config[section] as Record<string, unknown>)[field as string] = next
  })
  const showGeneral = game === undefined
  const show = (id: GameId) => game === undefined || game === id
  const anyDraftInvalid = Object.keys(invalidFields).length > 0

  return <div className="space-y-6" aria-busy={disabled}>
    {showGeneral && <Section title="General">
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField id="config-initial-balance" label="Starting balance" value={value.initialBalance} min={0} max={1e12} unit="currency" disabled={disabled} onCommit={next => patch(config => { config.initialBalance = next })} onFieldValidity={fieldValidity} />
        <NumberField id="config-reveal-multiplier" label="Reveal price multiplier" value={value.revealPotMultiplier} min={0} minExclusive max={1000} disabled={disabled} onCommit={next => patch(config => { config.revealPotMultiplier = next })} onFieldValidity={fieldValidity} />
      </div>
    </Section>}
    {!showGeneral && <Section title="General">
      <div className="max-w-sm"><NumberField id="config-reveal-multiplier" label="Reveal price multiplier" value={value.revealPotMultiplier} min={0} minExclusive max={1000} disabled={disabled} onCommit={next => patch(config => { config.revealPotMultiplier = next })} onFieldValidity={fieldValidity} /></div>
    </Section>}

    {show('bonus') && <Section title={gameLabels.bonus}>
      <>
        {renderRoundRow('bonus-bag', 'Bag amount', value.bonus.bag, (round, next) => editTriple('bonus', 'bag', round, next), { min: 0, max: 1e12, unit: 'currency' })}
        {renderRoundRow('bonus-threshold', 'Collective threshold', value.bonus.threshold, (round, next) => editTriple('bonus', 'threshold', round, next), { min: 0, max: 1e12, unit: 'currency' })}
        {renderRoundRow('bonus-multiplier', 'Threshold multiplier', value.bonus.multiplier, (round, next) => editTriple('bonus', 'multiplier', round, next), { min: 1, max: 1e6, unit: '×' })}
        <NumberField id="bonus-stars" label="Round-three stars" value={value.bonus.stars} min={0} max={1000} integer unit="stars" disabled={disabled} onCommit={next => editScalar('bonus', 'stars', next)} onFieldValidity={fieldValidity} />
      </>
    </Section>}

    {show('high-low') && <Section title={gameLabels['high-low']}>
      <>
        {renderRoundRow('high-low-pool', 'Base pool', value.highLow.pool, (round, next) => editTriple('highLow', 'pool', round, next), { min: 0, max: 1e12, unit: 'currency' })}
        {renderRoundRow('high-low-multiplier', 'Stake multiplier', value.highLow.multiplier, (round, next) => editTriple('highLow', 'multiplier', round, next), { min: 1, max: 1e6, unit: '×' })}
        <NumberField id="high-low-stars" label="Round-three stars" value={value.highLow.stars} min={0} max={1000} integer unit="stars" disabled={disabled} onCommit={next => editScalar('highLow', 'stars', next)} onFieldValidity={fieldValidity} />
      </>
    </Section>}

    {show('cave') && <Section title={gameLabels.cave}>
      <>
        {renderRoundRow('cave-starting-money', 'Starting money', value.cave.startingMoney, (round, next) => editTriple('cave', 'startingMoney', round, next), { min: 0, max: 1e12, unit: 'currency' })}
        {renderRoundRow('cave-growth', 'Growth multiplier', value.cave.growth, (round, next) => editTriple('cave', 'growth', round, next), { min: 1, max: 1e6, unit: '×' })}
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField id="cave-tick-seconds" label="Tick interval" value={value.cave.tickSeconds} min={1} max={3600} unit="seconds" disabled={disabled} onCommit={next => editScalar('cave', 'tickSeconds', next)} onFieldValidity={fieldValidity} />
          <NumberField id="cave-max-ticks" label="Maximum ticks" value={value.cave.maxTicks} min={1} max={1000} integer unit="ticks" disabled={disabled} onCommit={next => editScalar('cave', 'maxTicks', next)} onFieldValidity={fieldValidity} />
        </div>
        <fieldset className="border-t border-border pt-3">
          <legend className="mb-2 text-sm font-medium">Collapse risk by teams departed</legend>
          <p className="mb-3 text-xs text-muted-foreground">The saved configuration has {value.cave.collapseRisk.length} departure levels.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {value.cave.collapseRisk.map((risk, index) => <NumberField key={`cave-risk-${index}`} id={`cave-risk-${index}`} label={`${index} departed`} value={risk} min={0} max={100} unit="%" disabled={disabled} onCommit={next => patch(config => { const risks = [...config.cave.collapseRisk]; risks[index] = next; config.cave.collapseRisk = risks as GameConfig['cave']['collapseRisk'] })} onFieldValidity={fieldValidity} />)}
          </div>
        </fieldset>
        <NumberField id="cave-stars" label="Game stars" value={value.cave.stars} min={0} max={1000} integer unit="stars" disabled={disabled} onCommit={next => editScalar('cave', 'stars', next)} onFieldValidity={fieldValidity} />
      </>
    </Section>}

    {show('circle') && <Section title={gameLabels.circle}>
      {renderRoundRow('circle-multiplier', 'Transfer multiplier', value.circle.multiplier, (round, next) => editTriple('circle', 'multiplier', round, next), { min: 1, max: 1000, integer: true, unit: '×' })}
    </Section>}

    {show('bomb') && <Section title={gameLabels.bomb}>
      <>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField id="bomb-min-chits" label="Minimum chits per pile" value={value.bomb.minChits} min={1} max={1000} integer unit="chits" disabled={disabled} onCommit={next => patch(config => { config.bomb.minChits = next })} onFieldValidity={fieldValidity} />
          <NumberField id="bomb-standard-max" label="Standard maximum per pile" value={value.bomb.maxChits} min={1} max={1000} integer unit="chits" disabled={disabled} onCommit={next => patch(config => { config.bomb.maxChits = next })} onFieldValidity={fieldValidity} />
          <NumberField id="bomb-advantage-max" label="Most-starred maximum per pile" value={value.bomb.advantageChits} min={1} max={1000} integer unit="chits" disabled={disabled} onCommit={next => patch(config => { config.bomb.advantageChits = next })} onFieldValidity={fieldValidity} />
        </div>
        {renderRoundRow('bomb-factor', 'Bomb factor', value.bomb.factor, (round, next) => editTriple('bomb', 'factor', round, next), { min: 1, max: 1e6, unit: '×' })}
        {value.bomb.minChits > value.bomb.maxChits || value.bomb.maxChits > value.bomb.advantageChits ? <p className="text-sm text-destructive" role="alert">Chit limits must be minimum ≤ standard maximum ≤ most-starred maximum.</p> : null}
      </>
    </Section>}
    {!schemaValid && <p className="text-sm text-destructive" role="alert">Check the values above. The shared game rules reject this configuration.</p>}
    {anyDraftInvalid && <span className="sr-only" role="status">One or more configuration fields need attention.</span>}
  </div>
}
