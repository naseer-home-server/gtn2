import { initTRPC, TRPCError } from '@trpc/server'
import type { GameSessionsRepository } from './session-types.js'

export type Settings = { emailLoginEnabled: boolean }
export interface SettingsRepository {
  get(): Promise<Settings>
  setEmailLoginEnabled(enabled: boolean): Promise<Settings>
}

export type AuthUser = { id: string; email: string | null; isAdmin: boolean; isTestLogin: boolean }
export type TrpcContext = {
  user: AuthUser | null
  sessions: GameSessionsRepository
  settings: SettingsRepository
  signInWithTestEmail: (email: string) => Promise<void>
}
const t = initTRPC.context<TrpcContext>().create()
export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user || (ctx.user.isTestLogin && !(await ctx.settings.get()).emailLoginEnabled)) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  await requireMembership(ctx.user, ctx.sessions)
  return next({ ctx: { ...ctx, user: ctx.user } })
})
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.isAdmin || ctx.user.isTestLogin) throw new TRPCError({ code: 'FORBIDDEN' })
  return next({ ctx })
})
export async function requireTestLoginEnabled(settings: Pick<SettingsRepository, 'get'>) {
  if (!(await settings.get()).emailLoginEnabled) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Email test login is disabled.' })
  }
}

export async function requireMembership(user: AuthUser, sessions: GameSessionsRepository) {
  if (user.isAdmin && !user.isTestLogin) return null
  const membership = user.email ? await sessions.membership(user.email) : null
  if (!membership) throw new TRPCError({ code: 'FORBIDDEN', message: 'Your email is not invited to the active game session. Ask the host to add you or activate your session.' })
  return membership
}
