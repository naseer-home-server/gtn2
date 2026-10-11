import { initTRPC, TRPCError } from '@trpc/server'

export type Settings = { emailLoginEnabled: boolean }
export interface SettingsRepository {
  get(): Promise<Settings>
  setEmailLoginEnabled(enabled: boolean): Promise<Settings>
}

export type AuthUser = { id: string; email: string | null; isAdmin: boolean; isTestLogin: boolean }
export type TrpcContext = {
  user: AuthUser | null
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
