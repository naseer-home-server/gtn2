import { presentationState } from './presentation.js'
import { getPlayerRoster, resolveRosterPlayers } from './player-roster.js'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { DEFAULT_CONFIG, gameConfigSchema, playerCommandSchema } from './engine/config.js'
import { GAME_ORDER } from './engine/types.js'
import { MIN_TEAMS, MAX_TEAMS, MAX_TEAM_MEMBERS, MAX_SESSION_PLAYERS } from './engine/limits.js'
import { adminProcedure, protectedProcedure, publicProcedure, requireMembership, requireTestLoginEnabled, router, type TrpcContext } from './trpc.js'

function chatAccess(ctx: TrpcContext) {
  if (!ctx.user?.email) throw new TRPCError({ code: 'FORBIDDEN', message: 'A session player account is required for chats.' })
  if (!ctx.chats) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Chats are unavailable.' })
  return { email: ctx.user.email, chats: ctx.chats }
}

export const appRouter = router({
  chat: router({
    inbox: protectedProcedure.query(({ ctx }) => {
      const { email, chats } = chatAccess(ctx)
      return chats.inbox(email)
    }),
    direct: protectedProcedure.input(z.object({ teamId: z.uuid() })).mutation(({ ctx, input }) => {
      const { email, chats } = chatAccess(ctx)
      return chats.direct(email, input.teamId)
    }),
    createGroup: protectedProcedure.input(z.object({
      name: z.string().trim().min(1).max(60),
      playerIds: z.array(z.uuid()).min(2).max(MAX_SESSION_PLAYERS - 1).refine((ids) => new Set(ids).size === ids.length, 'Select each player once.'),
    })).mutation(({ ctx, input }) => {
      const { email, chats } = chatAccess(ctx)
      return chats.createGroup(email, input.name, input.playerIds)
    }),
    messages: protectedProcedure.input(z.object({ conversationId: z.uuid(), beforeSequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() })).query(({ ctx, input }) => {
      const { email, chats } = chatAccess(ctx)
      return chats.messages(email, input.conversationId, input.beforeSequence)
    }),
    send: protectedProcedure.input(z.object({
      conversationId: z.uuid(), text: z.string().trim().min(1).max(2_000), clientMessageId: z.uuid(),
    })).mutation(({ ctx, input }) => {
      const { email, chats } = chatAccess(ctx)
      return chats.send(email, input.conversationId, input.text, input.clientMessageId)
    }),
  }),
  game: router({
    state: protectedProcedure.query(({ ctx }) => {
      if (!ctx.user.email || !ctx.gameplay) throw new TRPCError({ code: 'FORBIDDEN', message: 'A game session player account is required.' })
      return ctx.gameplay.playerView(ctx.user.email)
    }),
    action: protectedProcedure.input(playerCommandSchema).mutation(({ ctx, input }) => {
      if (!ctx.user.email || !ctx.gameplay) throw new TRPCError({ code: 'FORBIDDEN', message: 'A game session player account is required.' })
      return ctx.gameplay.action(ctx.user.email, input, ctx.user.id)
    }),
  }),
  hello: protectedProcedure.query(() => ({ message: 'Hello world' })),
  auth: router({
    settings: publicProcedure.query(({ ctx }) => ctx.settings.get()),
    me: publicProcedure.query(async ({ ctx }) => {
      if (ctx.user?.isTestLogin && !(await ctx.settings.get()).emailLoginEnabled) return null
      if (!ctx.user) return null
      const gameSession = ctx.user.isAdmin && !ctx.user.isTestLogin
        ? (ctx.user.email ? await ctx.sessions.membership(ctx.user.email) : null)
        : await requireMembership(ctx.user, ctx.sessions)
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
    presentation: router({
      state: adminProcedure.input(z.object({ game: z.enum(GAME_ORDER).optional(), includeTeamEmails: z.boolean().optional(), includeFinalStandings: z.boolean().optional() })).query(({ ctx, input }) => {
        if (!ctx.gameplay) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
        return presentationState(ctx.sessions, ctx.gameplay, input.game, input.includeTeamEmails, input.includeFinalStandings)
      }),
    }),
    game: router({
      defaults: adminProcedure.query(() => DEFAULT_CONFIG),
      state: adminProcedure.input(z.object({ sessionId: z.uuid() })).query(({ ctx, input }) => {
        if (!ctx.gameplay) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
        return ctx.gameplay.adminView(input.sessionId)
      }),
      start: adminProcedure.input(z.object({ sessionId: z.uuid(), config: gameConfigSchema, startingGame: z.enum(GAME_ORDER).default('bonus'),
        teams: z.array(z.object({ name: z.string().trim().max(100).default(''), playerIds: z.array(z.uuid()).min(1).max(MAX_TEAM_MEMBERS) })).min(MIN_TEAMS).max(MAX_TEAMS),
      })).mutation(({ ctx, input }) => {
        if (!ctx.gameplay) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
        return ctx.gameplay.start(input.sessionId, input.teams, input.config, ctx.user.id, input.startingGame)
      }),
      startRound: adminProcedure.input(z.object({ sessionId: z.uuid(), control: z.object({ requestId: z.uuid(), expectedRevision: z.number().int().nonnegative(), config: gameConfigSchema.optional() }).optional() })).mutation(({ ctx, input }) => {
        if (!ctx.gameplay) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
        return ctx.gameplay.startRound(input.sessionId, ctx.user.id, input.control)
      }),
      adjustAccount: adminProcedure.input(z.object({
        sessionId: z.uuid(), requestId: z.uuid(), expectedRevision: z.number().int().nonnegative(), teamId: z.uuid(),
        balance: z.string().max(1000).regex(/^\d+(\.\d{1,2})?$/, 'Enter a nonnegative amount with at most two decimal places.'),
        stars: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), reason: z.string().trim().max(300).optional(),
      })).mutation(({ ctx, input }) => {
        if (!ctx.gameplay?.adjustAccount) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
        return ctx.gameplay.adjustAccount(input.sessionId, ctx.user.id, input)
      }),
      reset: adminProcedure.input(z.object({ sessionId: z.uuid() })).mutation(({ ctx, input }) => {
        if (!ctx.gameplay) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
        return ctx.gameplay.reset(input.sessionId, ctx.user.id)
      }),
      advance: adminProcedure.input(z.object({ sessionId: z.uuid(), control: z.object({ requestId: z.uuid(), expectedRevision: z.number().int().nonnegative(), config: gameConfigSchema.optional() }).optional() })).mutation(({ ctx, input }) => {
        if (!ctx.gameplay) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
        return ctx.gameplay.advance(input.sessionId, ctx.user.id, input.control)
      }),
    }),
    chats: router({
      audit: adminProcedure.input(z.object({ sessionId: z.uuid() })).query(({ ctx, input }) => {
        if (!ctx.chats) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Chats are unavailable.' })
        return ctx.chats.adminAudit(input.sessionId)
      }),
    }),
    sessions: router({
      list: adminProcedure.query(({ ctx }) => ctx.sessions.list()),
      get: adminProcedure.input(z.object({ id: z.uuid() })).query(({ ctx, input }) => ctx.sessions.get(input.id)),
      roster: adminProcedure.query(() => getPlayerRoster()),
      create: adminProcedure.input(z.object({
        name: z.string().trim().min(1).max(100),
        rosterIds: z.array(z.string().min(1).max(100)).min(1).max(MAX_SESSION_PLAYERS)
          .refine((ids) => new Set(ids).size === ids.length, 'Select each person once.'),
      })).mutation(async ({ ctx, input }) => {
        const profiles = await resolveRosterPlayers(input.rosterIds)
        return ctx.sessions.create(input.name, profiles.map((player) => player.email), ctx.user.id, profiles)
      }),
      setActive: adminProcedure.input(z.object({ id: z.uuid().nullable() })).mutation(({ ctx, input }) => ctx.sessions.setActive(input.id, ctx.user.id)),
      arrive: adminProcedure.input(z.object({ sessionId: z.uuid(), playerId: z.uuid() })).mutation(({ ctx, input }) => ctx.sessions.arrive(input.sessionId, input.playerId, ctx.user.id)),
      reorder: adminProcedure.input(z.object({ sessionId: z.uuid(), playerIds: z.array(z.uuid()).max(MAX_SESSION_PLAYERS) })).mutation(({ ctx, input }) => ctx.sessions.reorder(input.sessionId, input.playerIds, ctx.user.id)),
    }),
    settings: adminProcedure.query(({ ctx }) => ctx.settings.get()),
    setEmailLoginEnabled: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(({ ctx, input }) => ctx.settings.setEmailLoginEnabled(input.enabled)),
  }),
})
export type AppRouter = typeof appRouter
