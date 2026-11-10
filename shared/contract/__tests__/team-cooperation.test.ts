import { describe, expect, it } from 'vitest'
import { parseTeamConfiguration } from '../team'

const team = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' }

describe('team cooperation configuration', () => {
  it('preserves the optional switch without changing the scoring method or old configurations', () => {
    expect(parseTeamConfiguration(team, 4)).toEqual(team)
    expect(parseTeamConfiguration({ ...team, cooperationRules: true }, 4)).toEqual({ ...team, cooperationRules: true })
    expect(parseTeamConfiguration({ ...team, cooperationRules: false }, 4)).toEqual({ ...team, cooperationRules: false })
    for (const cooperationRules of ['true', 1, null]) {
      expect(() => parseTeamConfiguration({ ...team, cooperationRules }, 4)).toThrow('Invalid team configuration')
    }
  })
})
