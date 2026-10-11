import type { GameSessionsRepository } from './session-types.js'

// Existing auth tests use this boundary instead of a live database.
export const testSessions: GameSessionsRepository = {
  list: async () => [],
  get: async () => { throw new Error('Not implemented in auth fixture') },
  create: async () => { throw new Error('Not implemented in auth fixture') },
  setActive: async () => {},
  arrive: async () => {},
  reorder: async () => {},
  membership: async () => ({ sessionId: 'test-session', sessionName: 'Test night', playerId: 'test-player' }),
}
