import { z } from 'zod'
import { adminProcedure, protectedProcedure, publicProcedure, requireMembership, requireTestLoginEnabled, router } from './trpc.js'

export const appRouter = router({
  hello: protectedProcedure.query(() => ({ message: 'Hello world' })),
  auth: router({
    settings: publicProcedure.query(({ ctx }) => ctx.settings.get()),
    me: publicProcedure.query(async ({ ctx }) => {
      if (ctx.user?.isTestLogin && !(await ctx.settings.get()).emailLoginEnabled) return null
      if (!ctx.user) return null
      const gameSession = await requireMembership(ctx.user, ctx.sessions)
      return { ...ctx.user, gameSession }
    }),
    testEmailLogin: publicProcedure
      .input(z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) }))
      .mutation(async ({ ctx, input }) => {
        await requireTestLoginEnabled(ctx.settings)
        await requireMembership({ id: '', email: input.email, isAdmin: false, isTestLogin: true }, ctx.sessions)
        await ctx.signInWithTestEmail(input.email)
        return { success: true as const }
      }),
  }),
  admin: router({
    sessions: router({
      list: adminProcedure.query(({ ctx }) => ctx.sessions.list()),
      get: adminProcedure.input(z.object({ id: z.uuid() })).query(({ ctx, input }) => ctx.sessions.get(input.id)),
      create: adminProcedure.input(z.object({
        name: z.string().trim().min(1).max(100),
        emails: z.array(z.string().trim().toLowerCase().pipe(z.email().max(254))).min(1).max(10)
          .refine((emails) => new Set(emails).size === emails.length, 'Each email must be unique.'),
      })).mutation(({ ctx, input }) => ctx.sessions.create(input.name, input.emails, ctx.user.id)),
      setActive: adminProcedure.input(z.object({ id: z.uuid().nullable() })).mutation(({ ctx, input }) => ctx.sessions.setActive(input.id, ctx.user.id)),
      arrive: adminProcedure.input(z.object({ sessionId: z.uuid(), playerId: z.uuid() })).mutation(({ ctx, input }) => ctx.sessions.arrive(input.sessionId, input.playerId, ctx.user.id)),
      reorder: adminProcedure.input(z.object({ sessionId: z.uuid(), playerIds: z.array(z.uuid()).max(10) })).mutation(({ ctx, input }) => ctx.sessions.reorder(input.sessionId, input.playerIds, ctx.user.id)),
    }),
    settings: adminProcedure.query(({ ctx }) => ctx.settings.get()),
    setEmailLoginEnabled: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(({ ctx, input }) => ctx.settings.setEmailLoginEnabled(input.enabled)),
  }),
})
export type AppRouter = typeof appRouter
