// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { playerIdFromWsStatus } from '../GameContainerApi'

describe('GameContainerApi WS player identity', () => {
  it('uses the joined websocket seat as the local player when URL has no player param', () => {
    expect(playerIdFromWsStatus({ phase: 'ready', roomId: 'room-1', playerIndex: 1 })).toBe('p2')
  })
})
