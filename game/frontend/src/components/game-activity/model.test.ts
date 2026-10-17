import { describe, expect, it } from 'vitest'
import { gameActivities } from './model'

describe('gameActivities host audit events', () => {
  it('presents account corrections with team identity, exact before/after values, and the host note', () => {
    const [activity] = gameActivities([{
      id: 'account-audit', type: 'team.account_adjusted', game: 'bonus', round: 2,
      data: {
        teamId: 'team-a', before: { balance: '12345', stars: 2 }, after: { balance: '90007', stars: 4 }, reason: 'Host correction',
      },
    }], [{ id: 'team-a', name: 'Amber & Blue' }])

    expect(activity).toMatchObject({
      id: 'account-audit', game: 'bonus', round: 2, teamId: 'team-a', kind: 'stars', title: 'Account adjusted', note: 'Host correction',
      metrics: [
        { label: 'Balance before', value: '123.45' }, { label: 'Balance after', value: '900.07' },
        { label: 'Stars before', value: '★ 2' }, { label: 'Stars after', value: '★ 4' },
      ],
    })
  })

  it('summarizes effective config settings and reveal multiplier without attaching player or team data', () => {
    const [activity] = gameActivities([{
      id: 'config-audit', type: 'config.updated', game: 'cave', round: 1,
      data: {
        game: 'cave', section: 'cave', settings: { startingMoney: [25, 50, 75], tickSeconds: 4, collapseRisk: [0, 10, 40] },
        revealPotMultiplier: 1.5,
      },
    }], [{ id: 'team-a', name: 'Amber & Blue' }])

    expect(activity).toMatchObject({
      id: 'config-audit', game: 'cave', round: 1, teamId: undefined, kind: 'choice', title: 'Game settings applied',
      note: 'Cave mining settings are effective for this game.',
      metrics: [
        { label: 'Starting money', value: '25.00 / 50.00 / 75.00' },
        { label: 'Tick interval', value: '4s' },
        { label: 'Collapse risk', value: '0% / 10% / 40%' },
        { label: 'Reveal price', value: '×1.5' },
      ],
    })
    expect(activity?.metrics.some(metric => metric.value.includes('Amber') || metric.value.includes('Blue'))).toBe(false)
  })
})
