import SuperTokens from 'supertokens-node'
import Dashboard from 'supertokens-node/recipe/dashboard'
import Passwordless from 'supertokens-node/recipe/passwordless'
import Session from 'supertokens-node/recipe/session'
import ThirdParty from 'supertokens-node/recipe/thirdparty'
import UserRoles from 'supertokens-node/recipe/userroles'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} environment variable is not set`)
  return value
}
export function initSuperTokens() {
  const origin = requireEnv('APP_URL').replace(/\/$/, '')
  const admins = (process.env.SUPERTOKENS_DASHBOARD_ADMINS ?? '').split(',').map((email) => email.trim()).filter(Boolean)
  SuperTokens.init({
    framework: 'express',
    supertokens: {
      connectionURI: requireEnv('SUPERTOKENS_CONNECTION_URI'),
      apiKey: process.env.SUPERTOKENS_API_KEY || undefined,
    },
    appInfo: {
      appName: 'Game Theory Night 2', apiDomain: origin, websiteDomain: origin,
      apiBasePath: '/auth', websiteBasePath: '/login',
    },
    recipeList: [
      ThirdParty.init({
        signInAndUpFeature: { providers: [{ config: {
          thirdPartyId: 'google',
          clients: [{ clientId: requireEnv('GOOGLE_CLIENT_ID'), clientSecret: requireEnv('GOOGLE_CLIENT_SECRET') }],
        } }] },
      }),
      Passwordless.init({
        contactMethod: 'EMAIL', flowType: 'USER_INPUT_CODE',
        // Only the gated tRPC mutation can issue test sessions. No OTP APIs or emails.
        override: { apis: () => ({}) },
      }),
      Session.init(), UserRoles.init(), Dashboard.init({ admins }),
    ],
  })
}
export async function seedRoles() {
  await UserRoles.createNewRoleOrAddPermissions('admin', [])
}
