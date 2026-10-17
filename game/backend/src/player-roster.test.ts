import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TRPCError } from '@trpc/server'
import { createPlayerRosterLoader, getPlayerRoster, parsePlayerRoster } from './player-roster.js'

const records = [
  { id: 8, name: '  Asha Menon  ', email: ' ASHA@example.test ', phone: 'private' },
  { id: 12, name: 'Lee', email: 'lee@example.test', whatsapp: 'private' },
]

test('roster parser projects only the minimal normalized player fields', () => {
  assert.deepEqual(parsePlayerRoster(records), [
    { id: '8', name: 'Asha Menon', firstName: 'Asha', email: 'asha@example.test' },
    { id: '12', name: 'Lee', firstName: 'Lee', email: 'lee@example.test' },
  ])
})

test('roster parser rejects invalid required fields and duplicate IDs or normalized emails', () => {
  for (const invalid of [
    null,
    { ...records[0], id: 0 },
    { ...records[0], id: 1.5 },
    { ...records[0], name: '  ' },
    { ...records[0], email: '' },
    [records[0], { ...records[1], id: records[0].id }],
    [records[0], { ...records[1], email: ' ASHA@example.test ' }],
  ]) {
    assert.throws(() => parsePlayerRoster(invalid))
  }
})

test('bundled roster contains only the approved players and needs no path configuration', async () => {
  const roster = await getPlayerRoster()
  assert.equal(roster.length, 14)
  assert.deepEqual(roster.map(({ name }) => name), [
    'Rakshitha Arun', 'Piya Sial', 'Shreya Arora', 'Aditya Chandrasekhar',
    'Gulshan Fathima', 'Shiv Alagar', 'Arumugam ramaswamy', 'Chahana Ramesh',
    'Aryan Grab', 'Simrita', 'Abhinav Narayana Balasubramaniam',
    'Rajagopal Mahadevan Chellamani Iyer', 'Haren Bhandari', 'Akshara Ramanathan',
  ])
  assert.equal(roster.find(({ email }) => email === 'harenbhandari1@gmail.com')?.firstName, 'Haren')
  assert.equal(roster.find(({ email }) => email === 'akshu.ramanathan3108@gmail.com')?.firstName, 'Akshara')
})

test('roster loader reports an unreadable file clearly', async () => {
  const unreadable = createPlayerRosterLoader({ path: '/private/roster.json', readFile: async () => { throw new Error('no file') } })
  await assert.rejects(unreadable.getPlayerRoster(), (error: unknown) => {
    assert.ok(error instanceof TRPCError)
    assert.match(error.message, /bundled player roster could not be read/)
    return true
  })
})

test('roster loader reports malformed JSON and invalid roster data without exposing unrelated fields', async () => {
  const malformed = createPlayerRosterLoader({ path: 'roster.json', readFile: async () => '{' })
  await assert.rejects(malformed.getPlayerRoster(), /not valid JSON/)

  const invalid = createPlayerRosterLoader({ path: 'roster.json', readFile: async () => JSON.stringify([{ id: 1, name: '', email: 'a@example.test', phone: 'private' }]) })
  await assert.rejects(invalid.getPlayerRoster(), (error: unknown) => {
    assert.ok(error instanceof TRPCError)
    assert.match(error.message, /nonblank name/)
    assert.ok(!error.message.includes('private'))
    return true
  })
})

test('roster resolver preserves requested order and rejects duplicate or unknown IDs', async () => {
  const loader = createPlayerRosterLoader({ path: 'roster.json', readFile: async () => JSON.stringify(records) })
  assert.deepEqual(await loader.resolveRosterPlayers(['12', '8']), [
    { id: '12', name: 'Lee', firstName: 'Lee', email: 'lee@example.test' },
    { id: '8', name: 'Asha Menon', firstName: 'Asha', email: 'asha@example.test' },
  ])
  await assert.rejects(loader.resolveRosterPlayers(['8', '8']), { code: 'BAD_REQUEST' })
  await assert.rejects(loader.resolveRosterPlayers(['999']), { code: 'BAD_REQUEST' })
})
