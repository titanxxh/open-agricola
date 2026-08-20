// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  isHotseatModeQuery,
  isHotseatSetupQuery,
  parseDraftParamsFromQuery,
  parseHotseatSetupFromQuery,
  stripHotseatSetupParams,
} from '../game-setup-query'

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
  it('only asks for a deal on the initial hotseat flag', () => {
    expect(isHotseatSetupQuery('?hotseat=1&maxPlayers=3')).toBe(true)
    // Already dealt — a reload must resume, not deal again.
    expect(isHotseatSetupQuery('?hotseat=live')).toBe(false)
    expect(isHotseatSetupQuery('?hotseat=0')).toBe(false)
    expect(isHotseatSetupQuery('?transport=ws&maxPlayers=3')).toBe(false)
    expect(isHotseatSetupQuery('')).toBe(false)
  })
})

describe('isHotseatModeQuery', () => {
  it('covers both the pending deal and the running game', () => {
    expect(isHotseatModeQuery('?hotseat=1&maxPlayers=3')).toBe(true)
    expect(isHotseatModeQuery('?hotseat=live')).toBe(true)
  })

  it('leaves plain HTTP sessions alone', () => {
    // Workshop sandbox / E2E / debugging: one viewer, no handoff covers.
    expect(isHotseatModeQuery('?localSandbox=1')).toBe(false)
    expect(isHotseatModeQuery('?player=p1&devMode=1')).toBe(false)
    expect(isHotseatModeQuery('')).toBe(false)
  })
})

describe('parseHotseatSetupFromQuery', () => {
  it('carries the lobby selections into the setup payload', () => {
    expect(parseHotseatSetupFromQuery(
      '?hotseat=1&maxPlayers=5&enableParentCards=true&enableThroughTheSeasons=true',
    )).toEqual({
      playerCount: 5,
      enableCommunityDeck: false,
      enableParentCards: true,
      enableThroughTheSeasons: true,
      enableFarmersOfTheMoor: false,
      allowIncompleteFarmersOfTheMoorMinorDeal: false,
    })
  })

  it('defaults to a two-player classic game', () => {
    expect(parseHotseatSetupFromQuery('?hotseat=1')).toEqual({
      playerCount: 2,
      enableCommunityDeck: false,
      enableParentCards: false,
      enableThroughTheSeasons: false,
      enableFarmersOfTheMoor: false,
      allowIncompleteFarmersOfTheMoorMinorDeal: false,
    })
  })

  it('passes the draft mode and pool size through', () => {
    const setup = parseHotseatSetupFromQuery('?hotseat=1&draftMode=simultaneous&draftPoolSize=9')
    expect(setup.draftMode).toBe('simultaneous')
    expect(setup.draftPoolSize).toBe(9)
  })

  it('keeps workshop cards only while the community deck is on', () => {
    expect(parseHotseatSetupFromQuery(
      '?hotseat=1&enableCommunityDeck=true&customCards=card-a,card-b',
    ).customCardIds).toEqual(['card-a', 'card-b'])

    expect(parseHotseatSetupFromQuery(
      '?hotseat=1&customCards=card-a,card-b',
    ).customCardIds).toBeUndefined()
  })

  it('opts out of parent drafting only when asked', () => {
    expect(parseHotseatSetupFromQuery('?hotseat=1&draftParents=false').draftParents).toBe(false)
    expect(parseHotseatSetupFromQuery('?hotseat=1').draftParents).toBeUndefined()
  })
})

describe('leaving a hotseat game', () => {
  it('drops the hotseat flag so lobby navigation is not routed back to the game', async () => {
    const { buildPlatformPageUrl } = await import('../../utils/platform-page-url')
    const original = window.location.search
    window.history.replaceState(null, '', '/?hotseat=live&player=p1')
    try {
      const lobbyUrl = buildPlatformPageUrl('lobby')
      expect(lobbyUrl).not.toContain('hotseat')
      expect(isHotseatModeQuery(new URL(lobbyUrl, 'http://x').search)).toBe(false)
    } finally {
      window.history.replaceState(null, '', original || '/')
    }
  })
})

describe('stripHotseatSetupParams', () => {
  it('drops the setup keys but keeps the mode flag', () => {
    const stripped = stripHotseatSetupParams(
      '?hotseat=1&maxPlayers=4&enableFarmersOfTheMoor=true&draftMode=simultaneous',
    )
    expect(stripped).toBe('hotseat=live')
    // A reload of the stripped URL resumes the running game and stays hotseat.
    expect(isHotseatSetupQuery(`?${stripped}`)).toBe(false)
    expect(isHotseatModeQuery(`?${stripped}`)).toBe(true)
  })

  it('leaves unrelated keys alone', () => {
    expect(stripHotseatSetupParams('?hotseat=1&maxPlayers=4&dev=1')).toBe('dev=1&hotseat=live')
  })
})
