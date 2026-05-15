// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  farmCommitErrorMessageKey,
  getCurrentlySelectableRoomKeys,
  isDevModeAllowedFromQuery,
  playerIdFromWsStatus,
} from '../game-container-helpers'

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

  it('maps failed farm commits to local interaction error messages', () => {
    expect(farmCommitErrorMessageKey('room', 'NOT_CONNECTED')).toBe('ui.roomErrorNotConnected')
    expect(farmCommitErrorMessageKey('room', 'OCCUPIED')).toBe('ui.roomErrorOccupied')
    expect(farmCommitErrorMessageKey('stable', 'LIMIT_REACHED')).toBe('ui.stableErrorLimit')
    expect(farmCommitErrorMessageKey('plow', 'FENCED')).toBe('ui.plowErrorFenced')
    expect(farmCommitErrorMessageKey('sow', 'NO_SELECTION')).toBe('ui.sowErrorNoSelection')
  })

  it('keeps only currently connected room tiles selectable', () => {
    const baseTiles = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 1 },
      { row: 2, col: 1 },
    ]

    expect(getCurrentlySelectableRoomKeys(
      baseTiles,
      new Set(['1-0']),
      new Set(),
    )).toEqual(new Set(['0-0', '1-1']))

    expect(getCurrentlySelectableRoomKeys(
      baseTiles,
      new Set(['1-0']),
      new Set(['1-1']),
    )).toEqual(new Set(['0-0', '0-1', '1-1', '2-1']))
  })
})
