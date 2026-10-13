import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { middleware, errorHandler } from 'supertokens-node/framework/express'
import { verifySession } from 'supertokens-node/recipe/session/framework/express'
import { makeContext } from './context.js'
import { appRouter } from './router.js'
import type { SettingsRepository } from './trpc.js'
import { TRPCError } from '@trpc/server'
import { getHTTPStatusCodeFromError } from '@trpc/server/http'

export function createApp(settings: SettingsRepository, sessions: import('./session-types.js').GameSessionsRepository, gameplay?: import('./engine/types.js').GameplayRepository, chats?: import('./chat-types.js').ChatsRepository) {
  const app = express()
  const context = makeContext(settings, sessions, gameplay, chats)
  app.get('/health', (_request, response) => response.json({ status: 'ok' }))
  app.use(middleware())
  app.use(['/trpc', '/api/game'], (_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next() })
  app.use('/api/game', express.json({ limit: '64kb' }), verifySession({ sessionRequired: true }))
  const gameApi = (operation: 'state' | 'action') => async (request: express.Request, response: express.Response) => {
    try {
      const caller = appRouter.createCaller(await context({ req: request, res: response }))
      response.json(operation === 'state' ? await caller.game.state() : await caller.game.action(request.body))
    } catch (error) {
      const failure = error instanceof TRPCError ? error : new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      response.status(getHTTPStatusCodeFromError(failure)).json({ error: failure.message, code: failure.code })
    }
  }
  app.get('/api/game/state', gameApi('state'))
  app.post('/api/game/actions', gameApi('action'))
  app.use('/trpc', verifySession({ sessionRequired: false }), createExpressMiddleware({
    router: appRouter,
    createContext: context,
  }))
  app.use(errorHandler())
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public')
  app.use(express.static(publicDir))
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/auth/') || request.path.startsWith('/trpc/') || request.path.startsWith('/api/')) {
      response.sendStatus(404)
      return
    }
    response.sendFile(path.join(publicDir, 'index.html'), (error) => { if (error) next(error) })
  })
  return app
}
