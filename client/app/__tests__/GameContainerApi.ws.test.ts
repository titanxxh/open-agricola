// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { isDevModeAllowedFromQuery, playerIdFromWsStatus } from '../GameContainerApi'

describe('GameContainerApi WS player identity', () => {
  it('uses the joined websocket seat as the local player when URL has no player param', () => {
    expect(playerIdFromWsStatus({ phase: 'ready', roomId: 'room-1', playerIndex: 1 })).toBe('p2')
  })

  it('allows dev mode only for fixed dev rooms or embedded sandbox', () => {
    expect(isDevModeAllowedFromQuery('?page=game&transport=ws&room=dev2&devMode=1')).toBe(true)
    expect(isDevModeAllowedFromQuery('?page=game&embedded=1&devMode=1')).toBe(true)
    expect(isDevModeAllowedFromQuery('?page=game&transport=ws&room=abc123&devMode=1')).toBe(false)
    expect(isDevModeAllowedFromQuery('?page=game&devMode=1')).toBe(false)
  })
})
