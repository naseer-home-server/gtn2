import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export type RosterPlayer = {
  id: string
  name: string
  firstName: string
  email: string
}

type RosterFileReader = (path: string) => Promise<string>
type RosterPath = string

export function parsePlayerRoster(value: unknown): RosterPlayer[] {
  if (!Array.isArray(value)) throw new Error('The roster file must contain a JSON array.')
  const ids = new Set<number>()
  const emails = new Set<string>()
  const players = value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Roster entry ${index + 1} must be an object.`)
    }
    const record = item as Record<string, unknown>
    if (!Number.isSafeInteger(record.id) || (record.id as number) <= 0) {
      throw new Error(`Roster entry ${index + 1} must have a positive integer id.`)
    }
    if (typeof record.name !== 'string' || !record.name.trim()) {
      throw new Error(`Roster entry ${index + 1} must have a nonblank name.`)
    }
    if (typeof record.email !== 'string' || !record.email.trim()) {
      throw new Error(`Roster entry ${index + 1} must have a nonblank email.`)
    }

    const id = record.id as number
    const name = record.name.trim()
    const email = record.email.trim().toLowerCase()
    if (!z.email().safeParse(email).success) throw new Error(`Roster entry ${index + 1} must have a valid email.`)
    if (ids.has(id)) throw new Error(`Roster contains duplicate id ${id}.`)
    if (emails.has(email)) throw new Error(`Roster contains a duplicate email for ${email}.`)
    ids.add(id)
    emails.add(email)
    return { id: String(id), name, firstName: name.split(/\s+/)[0], email }
  })
  return players
}

export function createPlayerRosterLoader(options: {
  path?: RosterPath
  readFile?: RosterFileReader
} = {}) {
  const rosterPath = options.path ?? fileURLToPath(new URL('../data/player-roster.json', import.meta.url))
  const read = options.readFile ?? (async (path: string) => readFile(path, 'utf8'))

  async function getPlayerRoster(): Promise<RosterPlayer[]> {
    let contents: string
    try {
      contents = await read(rosterPath)
    } catch {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'The bundled player roster could not be read. Check that game/backend/data/player-roster.json is present and readable.',
      })
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'The bundled player roster is not valid JSON. Repair game/backend/data/player-roster.json.',
      })
    }
    try {
      return parsePlayerRoster(parsed)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The roster data is invalid.'
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Player roster is invalid: ${reason} Repair game/backend/data/player-roster.json.`,
      })
    }
  }

  async function resolveRosterPlayers(ids: string[]): Promise<RosterPlayer[]> {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !/^\d+$/.test(id)) || new Set(ids).size !== ids.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose each roster player once.' })
    }
    const roster = await getPlayerRoster()
    const playersById = new Map(roster.map((player) => [player.id, player]))
    const selected = ids.map((id) => playersById.get(id))
    if (selected.some((player) => player === undefined)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more selected players are not in the configured roster. Refresh the roster and try again.' })
    }
    return selected as RosterPlayer[]
  }

  return { getPlayerRoster, resolveRosterPlayers }
}

const defaultLoader = createPlayerRosterLoader()
export const getPlayerRoster = defaultLoader.getPlayerRoster
export const resolveRosterPlayers = defaultLoader.resolveRosterPlayers
