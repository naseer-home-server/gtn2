import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import SuperTokens from 'supertokens-node'
import Passwordless from 'supertokens-node/recipe/passwordless'
import Session from 'supertokens-node/recipe/session'
import type { SessionRequest } from 'supertokens-node/framework/express'
import UserRoles from 'supertokens-node/recipe/userroles'
import type { SettingsStore } from './settings.js'
import { requireTestLoginEnabled, type AuthUser, type TrpcContext } from './trpc.js'

export function makeContext(settings: SettingsStore) {
  return async ({ req, res }: CreateExpressContextOptions): Promise<TrpcContext> => {
    const session = (req as SessionRequest).session
    let user: AuthUser | null = null
    if (session) {
      const account = await SuperTokens.getUser(session.getUserId())
      const isTestLogin = session.getAccessTokenPayload().testLogin === true
      const { roles } = await UserRoles.getRolesForUser(session.getTenantId(), session.getUserId())
      if (account) user = {
        id: account.id, email: account.emails[0] ?? null,
        isAdmin: !isTestLogin && roles.includes('admin'), isTestLogin,
      }
    }
    return {
      user, settings,
      signInWithTestEmail: async (email) => {
        requireTestLoginEnabled(settings)
        // Account linking is not enabled: test and Google identities stay separate.
        const result = await Passwordless.signInUp({ tenantId: 'public', email })
        if (result.status !== 'OK') throw new Error('Unable to create test login.')
        requireTestLoginEnabled(settings)
        await Session.createNewSession(req, res, 'public', result.recipeUserId, { testLogin: true })
      },
    }
  }
}
