import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { type AppDb, closeDb, initDb } from './db/index.js'
import { DbSettingsRepository } from './db-settings.js'
import { DbGameSessionsRepository } from './game-sessions.js'
import { DbGameplayRepository } from './gameplay.js'
import { DbChatsRepository } from './chats.js'
import { DEFAULT_CONFIG } from './engine/config.js'
import type { TeamAssignment } from './engine/types.js'

test('PostgreSQL chats enforce active-session membership, team DMs, group membership, paging, and idempotency',
  { skip: process.env.RUN_DB_TESTS !== '1' }, async (t) => {
    const db = await initDb()
    t.after(closeDb)
    const rollback = new Error('Rollback chats database test data')
    try {
      await db.transaction(async (tx) => {
        const connection = tx as unknown as AppDb
        const settings = new DbSettingsRepository(connection)
        await settings.initialize()
        const sessions = new DbGameSessionsRepository(connection)
        const gameplay = new DbGameplayRepository(connection)
        const chats = new DbChatsRepository(connection)
        const emails = ['alice@example.test', 'alex@example.test', 'bea@example.test', 'ben@example.test', 'guest@example.test']
        const profiles = emails.map((email, index) => ({
          id: String(index + 1), email, name: ['Alice', 'Alex', 'Bea', 'Ben', 'Guest'][index]!,
          firstName: ['Alice', 'Alex', 'Bea', 'Ben', 'Guest'][index]!,
        }))
        const session = await sessions.create('Chat database test', emails, 'chat-test-admin', profiles)
        const playerFor = (email: string) => {
          const player = session.players.find((item) => item.email === email)
          assert.ok(player, `missing fixture player ${email}`)
          return player
        }
        await sessions.setActive(session.id, 'chat-test-admin')
        for (const email of emails.slice(0, 4)) await sessions.arrive(session.id, playerFor(email).id, 'chat-test-admin')
        const assignments: TeamAssignment[] = [
          { name: 'Pair A', playerIds: [playerFor(emails[0]!).id, playerFor(emails[1]!).id] },
          { name: 'Pair B', playerIds: [playerFor(emails[2]!).id, playerFor(emails[3]!).id] },
        ]
        await gameplay.start(session.id, assignments, structuredClone(DEFAULT_CONFIG), 'chat-test-admin')

        const aliceInbox = await chats.inbox(emails[0]!)
        assert.equal(aliceInbox.sessionId, session.id)
        assert.equal(aliceInbox.players.find(({ email }) => email === emails[0])?.firstName, 'Alice')
        assert.deepEqual(aliceInbox.players.map(({ id }) => id).sort(), [...session.players].map(({ id }) => id).sort())
        assert.deepEqual(aliceInbox.teams.map(({ playerIds }) => playerIds.length), [2, 2])
        assert.ok(aliceInbox.players.every((player) => !('balance' in player) && !('rank' in player) && !('earnings' in player)))
        assert.ok(aliceInbox.teams.every((team) => !('balance' in team) && !('rank' in team) && !('earnings' in team)))
        const aliceId = playerFor(emails[0]!).id
        const alexId = playerFor(emails[1]!).id
        const beaId = playerFor(emails[2]!).id
        const benId = playerFor(emails[3]!).id
        const guestId = playerFor(emails[4]!).id
        const teamA = aliceInbox.teams.find(({ playerIds }) => playerIds.includes(aliceId))!
        const teamB = aliceInbox.teams.find(({ playerIds }) => playerIds.includes(beaId))!

        const directFromLeader = await chats.direct(emails[0]!, teamB.id)
        const directFromNonleader = await chats.direct(emails[1]!, teamB.id)
        const directFromOtherTeam = await chats.direct(emails[3]!, teamA.id)
        assert.equal(directFromLeader.id, directFromNonleader.id, 'a nonleader can open and reuse their own team conversation')
        assert.equal(directFromLeader.id, directFromOtherTeam.id, 'the other team can open the same conversation in reverse')
        assert.equal(directFromLeader.kind, 'direct')
        assert.deepEqual(new Set(directFromLeader.playerIds), new Set([aliceId, alexId, beaId, benId]))
        assert.ok((await chats.inbox(emails[1]!)).conversations.some(({ id }) => id === directFromLeader.id), 'a nonleader teammate shares their team inbox')

        const group = await chats.createGroup(emails[0]!, 'Friends', [beaId, guestId])
        assert.equal((await chats.adminAudit(session.id)).players.find(({ email }) => email === emails[2])?.firstName, 'Bea')
        assert.equal(group.kind, 'group')
        assert.equal(group.name, 'Friends')
        assert.deepEqual(new Set(group.playerIds), new Set([aliceId, beaId, guestId]))
        await assert.rejects(chats.createGroup(emails[0]!, 'Bad members', [beaId, beaId]), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.createGroup(emails[0]!, 'Includes creator', [aliceId, beaId]), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.createGroup(emails[0]!, 'Outside session', [beaId, randomUUID()]), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.createGroup(emails[0]!, '   ', [beaId, guestId]), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.createGroup(emails[0]!, 'x'.repeat(81), [beaId, guestId]), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.createGroup(emails[0]!, 'Too few', [beaId]), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.createGroup(emails[0]!, 'Too many', [beaId, benId, guestId, ...Array.from({ length: 7 }, () => randomUUID())]), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.direct(emails[0]!, teamA.id), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.direct(emails[0]!, randomUUID()), { code: 'BAD_REQUEST' })

        assert.ok(!(await chats.inbox(emails[4]!)).conversations.some(({ id }) => id === directFromLeader.id), 'unassigned invited players do not see conversations they are not part of')
        await assert.rejects(chats.messages(emails[4]!, directFromLeader.id), { code: 'NOT_FOUND' })
        await assert.rejects(chats.send(emails[4]!, directFromLeader.id, 'intrusion', randomUUID()), { code: 'NOT_FOUND' })
        assert.ok(!(await chats.inbox(emails[1]!)).conversations.some(({ id }) => id === group.id), 'group conversations are visible only to selected members')
        await assert.rejects(chats.messages(emails[1]!, group.id), { code: 'NOT_FOUND' })
        await assert.rejects(chats.send(emails[1]!, group.id, 'intrusion', randomUUID()), { code: 'NOT_FOUND' })
        await assert.rejects(chats.send(emails[0]!, directFromLeader.id, '   ', randomUUID()), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.send(emails[0]!, directFromLeader.id, 'x'.repeat(2001), randomUUID()), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.send(emails[0]!, directFromLeader.id, 'valid text', '   '), { code: 'BAD_REQUEST' })
        await assert.rejects(chats.messages(emails[0]!, directFromLeader.id, 0), { code: 'BAD_REQUEST' })

        const retriedId = randomUUID()
        const first = await chats.send(emails[0]!, directFromLeader.id, 'hello team', retriedId)
        const retry = await chats.send(emails[0]!, directFromLeader.id, 'hello team', retriedId)
        assert.equal(retry.id, first.id)
        assert.equal((await chats.inbox(emails[0]!)).conversations.find(item => item.id === directFromLeader.id)?.lastIncomingSequence, null, 'own messages do not create notifications')
        assert.equal((await chats.inbox(emails[2]!)).conversations.find(item => item.id === directFromLeader.id)?.lastIncomingSequence, first.sequence, 'recipients receive an incoming position')

        await assert.rejects(chats.send(emails[0]!, directFromLeader.id, 'changed text', retriedId), { code: 'CONFLICT' })

        // PostgreSQL sequence numbers define stable page boundaries even if several rows share a timestamp.
        for (let index = 0; index < 54; index++) {
          await chats.send(emails[index % 2]!, directFromLeader.id, `page message ${index}`, randomUUID())
        }
        const newestPage = await chats.messages(emails[0]!, directFromLeader.id)
        assert.equal(newestPage.messages.length, 50)
        assert.equal(newestPage.hasMore, true)
        assert.equal(new Set(newestPage.messages.map(({ createdAt }) => createdAt)).size, 1, 'messages in this transaction share a timestamp')
        assert.deepEqual(newestPage.messages.map(({ sequence }) => sequence), [...newestPage.messages.map(({ sequence }) => sequence)].sort((a, b) => a - b))
        const olderPage = await chats.messages(emails[0]!, directFromLeader.id, newestPage.messages[0]!.sequence)
        assert.equal(olderPage.hasMore, false)
        const seen = [...olderPage.messages, ...newestPage.messages].map(({ id }) => id)
        assert.equal(seen.length, 55)
        assert.equal(new Set(seen).size, seen.length, 'adjacent pages contain no duplicate message')
        const combinedSequences = [...olderPage.messages, ...newestPage.messages].map(({ sequence }) => sequence)
        assert.deepEqual(combinedSequences, [...combinedSequences].sort((a, b) => a - b), 'pages compose into chronological order')

        const ownReply = await chats.send(emails[0]!, directFromLeader.id, 'own reply after an incoming message', randomUUID())
        const notificationInbox = (await chats.inbox(emails[0]!)).conversations.find(item => item.id === directFromLeader.id)!
        assert.equal(notificationInbox.lastMessage?.id, ownReply.id)
        assert.equal(notificationInbox.lastIncomingSequence, newestPage.messages.at(-1)?.sequence, 'a newer own message must not mask incoming messages')

        const other = await sessions.create('Other chat session', [emails[0]!, 'other@example.test'], 'chat-test-admin')
        await sessions.setActive(other.id, 'chat-test-admin')
        const otherInbox = await chats.inbox(emails[0]!)
        assert.equal(otherInbox.sessionId, other.id)
        assert.deepEqual(otherInbox.players.map(({ email }) => email), ['alice@example.test', 'other@example.test'])
        assert.deepEqual(otherInbox.conversations, [])
        await assert.rejects(chats.messages(emails[0]!, directFromLeader.id), { code: 'NOT_FOUND' })

        await sessions.setActive(null, 'chat-test-admin')
        await assert.rejects(chats.inbox(emails[0]!), { code: 'FORBIDDEN' })

        await sessions.setActive(session.id, 'chat-test-admin')
        assert.equal((await chats.messages(emails[0]!, directFromLeader.id)).messages.length, 50)
        await gameplay.reset(session.id, 'chat-test-admin')
        const afterReset = await chats.messages(emails[0]!, directFromLeader.id)
        assert.equal(afterReset.messages.length, 50)
        assert.equal((await chats.inbox(emails[0]!)).conversations.find(({ id }) => id === directFromLeader.id)?.lastMessage?.id,
          ownReply.id)
        throw rollback
      })
    } catch (error) {
      if (error !== rollback) throw error
    }
  })
