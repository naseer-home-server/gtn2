import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { middleware, errorHandler } from 'supertokens-node/framework/express'
import { verifySession } from 'supertokens-node/recipe/session/framework/express'
import { makeContext } from './context.js'
import { appRouter } from './router.js'
import type { SettingsRepository } from './trpc.js'

export function createApp(settings: SettingsRepository) {
  const app = express()
  app.get('/health', (_request, response) => response.json({ status: 'ok' }))
  app.use(middleware())
  app.use('/trpc', verifySession({ sessionRequired: false }), createExpressMiddleware({
    router: appRouter,
    createContext: makeContext(settings),
  }))
  app.use(errorHandler())
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public')
  app.use(express.static(publicDir))
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/auth/') || request.path.startsWith('/trpc/')) {
      response.sendStatus(404)
      return
    }
    response.sendFile(path.join(publicDir, 'index.html'), (error) => { if (error) next(error) })
  })
  return app
}
