import type { GameSessionsRepository } from './session-types.js'
import SuperTokens from 'supertokens-node'
import Dashboard from 'supertokens-node/recipe/dashboard'
import EmailPassword from 'supertokens-node/recipe/emailpassword'
import Passwordless from 'supertokens-node/recipe/passwordless'
import Session from 'supertokens-node/recipe/session'
import ThirdParty from 'supertokens-node/recipe/thirdparty'
import UserRoles from 'supertokens-node/recipe/userroles'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} environment variable is not set`)
  return value
}
export function initSuperTokens(sessions: GameSessionsRepository) {
  const origin = requireEnv('APP_URL').replace(/\/$/, '')
  const localAuth = process.env.LOCAL === 'true'
  if (localAuth && process.env.NODE_ENV === 'production') throw new Error('LOCAL email/password authentication cannot run in production.')
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
      ...(localAuth ? [EmailPassword.init({
        override: { apis: (original) => ({
          ...original,
          signInPOST: async (input) => {
            if (!original.signInPOST) throw new Error('Email/password sign-in API is unavailable.')
            const result = await original.signInPOST(input)
            if (result.status !== 'OK') return result
            const email = String(input.formFields.find((field) => field.id === 'email')?.value ?? '').trim().toLowerCase()
            await assignLocalAdmin(email, input.tenantId, result.user.id)
            if (!(await isEmailLoginAllowed(email, input.tenantId, result.user.id, sessions))) {
              await result.session.revokeSession()
              return { status: 'SIGN_IN_NOT_ALLOWED' as const, reason: 'Use an email invited to the active game session.' }
            }
            return result
          },
          signUpPOST: async (input) => {
            if (!original.signUpPOST) throw new Error('Email/password sign-up API is unavailable.')
            const result = await original.signUpPOST(input)
            if (result.status !== 'OK') return result
            const email = String(input.formFields.find((field) => field.id === 'email')?.value ?? '').trim().toLowerCase()
            await assignLocalAdmin(email, input.tenantId, result.user.id)
            if (!(await isEmailLoginAllowed(email, input.tenantId, result.user.id, sessions))) {
              await result.session.revokeSession()
              return { status: 'SIGN_UP_NOT_ALLOWED' as const, reason: 'Only active session players can create an account.' }
            }
            return result
          },
        }) },
      })] : [ThirdParty.init({
        override: { functions: (original) => ({ ...original, signInUp: async (input) => {
          const result = await original.signInUp(input)
          if (result.status !== 'OK') return result
          if (!(await isGoogleLoginAllowed(input.tenantId, result.user.id, input.email, input.isVerified, sessions))) {
            return { status: 'SIGN_IN_UP_NOT_ALLOWED' as const, reason: 'Your email is not invited to the active game session. Contact the host.' }
          }
          return result
        } }) },
        signInAndUpFeature: { providers: [{ config: {
          thirdPartyId: 'google',
          clients: [{ clientId: requireEnv('GOOGLE_CLIENT_ID'), clientSecret: requireEnv('GOOGLE_CLIENT_SECRET') }],
        } }] },
      })]),
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

export async function isGoogleLoginAllowed(tenantId: string, userId: string, email: string, verified: boolean, sessions: GameSessionsRepository) {
  const { roles } = await UserRoles.getRolesForUser(tenantId, userId)
  return roles.includes('admin') || (verified && (await sessions.membership(email)) !== null)
}

const LOCAL_ADMIN_EMAIL = 'admin@test.com'
async function assignLocalAdmin(email: string, tenantId: string, userId: string) {
  if (email === LOCAL_ADMIN_EMAIL) await UserRoles.addRoleToUser(tenantId, userId, 'admin')
}
async function isEmailLoginAllowed(email: string, tenantId: string, userId: string, sessions: GameSessionsRepository) {
  const { roles } = await UserRoles.getRolesForUser(tenantId, userId)
  return roles.includes('admin') || (await sessions.membership(email)) !== null
}
