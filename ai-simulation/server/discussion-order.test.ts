import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDiscussionSwaps, assertDiscussionRoster, parseDiscussionSwaps, type DiscussionSwap } from './discussion-order.js'

function permutations(values: string[]): string[][] {
  if (!values.length) return [[]]
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest]))
}

test('sequential position swaps can reach every order of two to five teams without losing a team', () => {
  for (let count = 2; count <= 5; count++) {
    const initial = Array.from({ length: count }, (_, index) => 'team-' + index)
    for (const target of permutations(initial)) {
      const current = [...initial]
      const swaps: DiscussionSwap[] = []
      for (let index = 0; index < count - 1; index++) {
        const source = current.indexOf(target[index]!)
        if (source === index) continue
        swaps.push({ firstPosition: index + 1, secondPosition: source + 1 })
        ;[current[index], current[source]] = [current[source]!, current[index]!]
      }
      const result = applyDiscussionSwaps(initial, swaps)
      assert.deepEqual(result, target)
      assertDiscussionRoster(result, initial)
      assert.equal(result.length, count)
      assert.equal(new Set(result).size, count)
      assert.deepEqual(initial, Array.from({ length: count }, (_, index) => 'team-' + index), 'swaps must not mutate the saved random order')
    }
  }
})

test('no swaps keep the random order and chained swaps use the current positions', () => {
  assert.deepEqual(applyDiscussionSwaps(['a', 'b', 'c'], []), ['a', 'b', 'c'])
  assert.deepEqual(applyDiscussionSwaps(['a', 'b', 'c'], [
    { firstPosition: 1, secondPosition: 3 }, { firstPosition: 1, secondPosition: 2 },
  ]), ['b', 'c', 'a'])
})

test('invalid swaps, extra fields, replacement orders, and malformed saved rosters are rejected', () => {
  for (const value of [
    { swaps: [{ firstPosition: 0, secondPosition: 2 }] },
    { swaps: [{ firstPosition: -1, secondPosition: 2 }] },
    { swaps: [{ firstPosition: 1, secondPosition: 4 }] },
    { swaps: [{ firstPosition: 1.5, secondPosition: 2 }] },
    { swaps: [{ firstPosition: 'ghost-team', secondPosition: 2 }] },
    { swaps: [{ firstPosition: 1, secondPosition: 1 }] },
    { swaps: [{ firstPosition: 1, secondPosition: 2, teamId: 'ghost-team' }] },
    { swaps: Array.from({ length: 3 }, () => ({ firstPosition: 1, secondPosition: 2 })) },
    { swaps: [], schedulerOrder: ['ghost-team'] },
    { swaps: [], message: 'A player should make a transfer.' },
    { swaps: [], actionJson: '{}' },
    { order: ['team-1'] }, { swaps: null }, { swaps: '[]' }, null,
  ]) assert.throws(() => parseDiscussionSwaps(value, 3), /./)
  for (const order of [['a'], ['a', 'a'], ['a', 'ghost'], ['a', 'b', 'c'], null]) {
    assert.throws(() => assertDiscussionRoster(order, ['a', 'b']), /every current team exactly once/)
  }
})
