import { useMemo } from 'react'
import type { TeamAssignment } from 'backend/game'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type TeamAssignmentPlayer = {
  id: string
  email: string
  arrivalOrder: number | null
  firstName?: string | null
  name?: string | null
}

type Props = {
  players: TeamAssignmentPlayer[]
  value: TeamAssignment[]
  onChange: (teams: TeamAssignment[]) => void
  disabled?: boolean
}

function playerFirstName(player: TeamAssignmentPlayer | undefined) {
  if (!player) return ''
  const explicit = player.firstName?.trim()
  if (explicit) return explicit
  const name = player.name?.trim()
  if (name) return name.split(/\s+/)[0]
  return player.email.split('@')[0] || player.email
}

function teamName(playerIds: string[], playersById: Map<string, TeamAssignmentPlayer>, index: number) {
  const names = playerIds.map((id) => playerFirstName(playersById.get(id))).filter(Boolean)
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  if (names.length === 1) return names[0]
  return `Team ${index + 1}`
}

const emptyTeam = (index: number): TeamAssignment => ({ name: `Team ${index + 1}`, playerIds: [] })

export function TeamAssignmentEditor({ players, value, onChange, disabled = false }: Props) {
  const arrived = useMemo(() => players
    .filter((player) => player.arrivalOrder !== null)
    .sort((left, right) => left.arrivalOrder! - right.arrivalOrder!), [players])
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const soloTeams = value.filter((team) => team.playerIds.length === 1).length

  function updatePlayer(teamIndex: number, slotIndex: number, playerId: string) {
    const next = value.map((team, index) => {
      if (index !== teamIndex) return team
      const ids = [...team.playerIds]
      if (slotIndex === 0) {
        if (playerId) ids[0] = playerId
        else ids.shift()
      } else if (playerId) {
        ids[1] = playerId
      } else {
        ids.splice(1, 1)
      }
      const playerIds = ids.filter(Boolean)
      return { playerIds, name: teamName(playerIds, playersById, teamIndex) }
    })
    onChange(next)
  }

  function optionsFor(teamIndex: number, slotIndex: number) {
    const current = value[teamIndex]?.playerIds[slotIndex]
    const usedElsewhere = new Set(value.flatMap((team, index) => team.playerIds
      .filter((_id, playerIndex) => !(index === teamIndex && playerIndex === slotIndex))))
    return arrived.filter((player) => player.id === current || !usedElsewhere.has(player.id))
  }

  return <section className="team-assignment-editor space-y-4" aria-labelledby="team-assignment-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 id="team-assignment-heading" className="text-base font-semibold">Team assignment</h3><p className="mt-1 text-sm text-muted-foreground">Choose arrived players. Team names follow the order you select them.</p></div>
      <Button type="button" variant="outline" className="min-h-11" disabled={disabled || value.length >= 7} onClick={() => onChange([...value, emptyTeam(value.length)])}><Plus aria-hidden="true" />Add team</Button>
    </div>

    <div className="space-y-3">
      {value.map((team, teamIndex) => {
        const first = team.playerIds[0] ?? ''
        const second = team.playerIds[1] ?? ''
        const isSolo = Boolean(first && !second)
        return <article key={teamIndex} className="team-assignment-row min-w-0 rounded-lg border border-border/70 bg-card/70 p-3 sm:p-4">
          <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0"><p className="break-words text-base font-medium">{team.name || `Team ${teamIndex + 1}`}</p><p className="text-xs text-muted-foreground">{isSolo ? 'Solo team' : 'Team name updates from selected players'}</p></div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove team ${teamIndex + 1}`} disabled={disabled || value.length <= 2} onClick={() => onChange(value.filter((_, index) => index !== teamIndex).map((item, index) => ({ ...item, name: teamName(item.playerIds, playersById, index) })))}><Trash2 aria-hidden="true" /></Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((slotIndex) => {
              const selected = team.playerIds[slotIndex] ?? ''
              const label = `Team ${teamIndex + 1}, ${slotIndex === 0 ? 'first' : 'second'} player`
              return <label key={slotIndex} className="block min-w-0 space-y-1.5 text-sm font-medium">
                <span>{slotIndex === 0 ? 'First player' : 'Second player'}</span>
                <select aria-label={label} className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60" value={selected} disabled={disabled || (slotIndex === 1 && !first)} onChange={(event) => updatePlayer(teamIndex, slotIndex, event.target.value)}>
                  <option value="" disabled={slotIndex === 1 && !selected && soloTeams > 0 && !isSolo}>{slotIndex === 0 ? 'Choose first player' : 'Leave solo'}</option>
                  {optionsFor(teamIndex, slotIndex).map((player) => <option key={player.id} value={player.id}>{player.name?.trim() || player.email} · {player.email}</option>)}
                </select>
              </label>
            })}
          </div>
          {isSolo && <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{soloTeams > 1 ? 'Only one solo team is allowed. Pair this player or clear another solo team.' : 'This team has one player. Use a solo team only when attendance is odd.'}</p>}
        </article>
      })}
    </div>
    {arrived.length < 2 && <p className="text-sm text-destructive" role="status">At least two players must have arrived before teams can start.</p>}
    {value.length < 2 && <p className="text-sm text-destructive" role="status">Add at least two teams.</p>}
    {value.length >= 7 && <p className="text-sm text-muted-foreground">You have reached the seven-team limit.</p>}
  </section>
}
