import { describe, expect, it } from 'vitest'
import { parseTeamConfigurationFromQuery } from '../game-setup-query'

describe('team creation query', () => {
  it('round-trips team settings with all three legal formats', () => {
    for (const [maxPlayers, seatsPerTeam] of [[4, 2], [6, 2], [6, 3]] as const) {
      const config = { mode: 'team', seatsPerTeam, seating: 'random', scoring: 'sum', teammateVisibility: 'private' }
      const search = new URLSearchParams({ maxPlayers: String(maxPlayers), teamConfig: JSON.stringify(config) }).toString()
      expect(parseTeamConfigurationFromQuery(search)).toEqual(config)
    }
    expect(parseTeamConfigurationFromQuery('?maxPlayers=4')).toBeUndefined()
  })

  it('rejects malformed settings and an illegal four-player three-seat team', () => {
    expect(() => parseTeamConfigurationFromQuery('?maxPlayers=4&teamConfig=broken')).toThrow()
    const search = new URLSearchParams({ maxPlayers: '4', teamConfig: JSON.stringify({
      mode: 'team', seatsPerTeam: 3, seating: 'random', scoring: 'sum', teammateVisibility: 'private',
    }) }).toString()
    expect(() => parseTeamConfigurationFromQuery(search)).toThrow('Invalid team configuration')
  })
})
