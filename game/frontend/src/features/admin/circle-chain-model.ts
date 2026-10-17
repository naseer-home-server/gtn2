/** A valid circle map is a permutation of every team with no singleton cycles. */
export function circleChains(next: Record<string, string>, teamIds: string[]): string[][] {
  const ids = new Set(teamIds)
  if (Object.keys(next).length !== ids.size || Object.values(next).some(id => !ids.has(id)) || new Set(Object.values(next)).size !== ids.size) throw new Error('Circle links are incomplete.')
  const visited = new Set<string>(), chains: string[][] = []
  for (const start of teamIds) {
    if (visited.has(start)) continue
    const chain: string[] = []
    let id = start
    while (!visited.has(id)) {
      if (!ids.has(id)) throw new Error('Circle contains an unknown team.')
      visited.add(id); chain.push(id); id = next[id]
    }
    if (id !== start || chain.length < 2) throw new Error('Circle links do not form closed chains.')
    chains.push(chain)
  }
  return chains
}

export type CircleStartEvent = {
  id: string
  type: string
  data: Record<string, unknown>
}

/** Return only starts from the latest attempt at the circle game. Older events stay in the audit log. */
export function currentCircleStarts(events: readonly CircleStartEvent[]): CircleStartEvent[] {
  const latestCircleReset = events.reduce((lastReset, event, index) =>
    event.type === 'game.reset' && event.data.game === 'circle' ? index : lastReset, -1)
  return events.slice(latestCircleReset + 1).filter(event => event.type === 'circle.started')
}

/** A selector value may refer to a round removed from the current attempt after reset. */
export function normalizeCircleSelection(selected: string, starts: readonly CircleStartEvent[]): string {
  return selected === 'latest' || starts.some(event => event.id === selected) ? selected : 'latest'
}
