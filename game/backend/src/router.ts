import { z } from 'zod'
import { adminProcedure, protectedProcedure, publicProcedure, requireTestLoginEnabled, router } from './trpc.js'

export const appRouter = router({
  hello: protectedProcedure.query(() => ({ message: 'Hello world' })),
  auth: router({
    settings: publicProcedure.query(({ ctx }) => ctx.settings.get()),
    me: publicProcedure.query(async ({ ctx }) => {
      if (ctx.user?.isTestLogin && !(await ctx.settings.get()).emailLoginEnabled) return null
      return ctx.user
    }),
    testEmailLogin: publicProcedure
      .input(z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) }))
      .mutation(async ({ ctx, input }) => {
        await requireTestLoginEnabled(ctx.settings)
        await ctx.signInWithTestEmail(input.email)
        return { success: true as const }
      }),
  }),
  admin: router({
    settings: adminProcedure.query(({ ctx }) => ctx.settings.get()),
    setEmailLoginEnabled: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(({ ctx, input }) => ctx.settings.setEmailLoginEnabled(input.enabled)),
  }),
})
export type AppRouter = typeof appRouter
