import { describe, expect, it } from 'vitest'
import { isHotseatSetupQuery, parseDraftParamsFromQuery } from '../game-setup-query'

describe('parseDraftParamsFromQuery', () => {
  it('returns undefined when draftMode is missing / none / unknown', () => {
    expect(parseDraftParamsFromQuery('')).toBeUndefined()
    expect(parseDraftParamsFromQuery('?maxPlayers=3')).toBeUndefined()
    expect(parseDraftParamsFromQuery('?draftMode=none')).toBeUndefined()
    expect(parseDraftParamsFromQuery('?draftMode=bogus')).toBeUndefined()
  })

  it('returns simultaneous with poolSize when both are valid', () => {
    expect(parseDraftParamsFromQuery('?draftMode=simultaneous&draftPoolSize=8')).toEqual({
      draftMode: 'simultaneous',
      draftPoolSize: 8,
    })
    expect(parseDraftParamsFromQuery('?draftMode=simultaneous&draftPoolSize=10')).toEqual({
      draftMode: 'simultaneous',
      draftPoolSize: 10,
    })
  })

  it('drops out-of-range or non-integer poolSize but keeps draftMode', () => {
    for (const bad of ['6', '11', 'abc', '7.5']) {
      expect(parseDraftParamsFromQuery(`?draftMode=simultaneous&draftPoolSize=${bad}`)).toEqual({
        draftMode: 'simultaneous',
      })
    }
  })

  it('omits poolSize when missing so server chooses default', () => {
    expect(parseDraftParamsFromQuery('?draftMode=simultaneous')).toEqual({
      draftMode: 'simultaneous',
    })
  })
})

describe('isHotseatSetupQuery', () => {
  it('only recognises the lobby hotseat flag', () => {
    expect(isHotseatSetupQuery('?transport=ws&hotseat=1&maxPlayers=3')).toBe(true)
    expect(isHotseatSetupQuery('?transport=ws&maxPlayers=3')).toBe(false)
    expect(isHotseatSetupQuery('?hotseat=0')).toBe(false)
    expect(isHotseatSetupQuery('')).toBe(false)
  })

  it('does not treat a joined room link as a new hotseat request', () => {
    // Reloading a running hotseat game joins room=... instead of creating one;
    // whether it is hotseat then comes from the server's roomJoined answer.
    expect(isHotseatSetupQuery('?transport=ws&room=abc123')).toBe(false)
  })
})
