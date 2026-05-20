// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../../shared/contract/events'

import {
  farmCommitErrorMessageKey,
  filterPublicFarmHighlightsForPlayer,
  filterPublicFenceHighlightsForPlayer,
  getCurrentlySelectableRoomKeys,
  hasPublicEventHighlights,
  isDevModeAllowedFromQuery,
  mergePublicEventHighlights,
  playerIdFromWsStatus,
  removePublicEventHighlights,
} from '../game-container-helpers'
import { collectNewPublicEventFeedback } from '../public-event-notifications'

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

  it('merges and removes public event highlights for timer cleanup', () => {
    const incoming = {
      actionIds: ['forest'],
      farmTiles: [{ playerId: 'p1', key: '0-0' }],
      fenceEdges: [{ playerId: 'p1', edgeId: 'h-0-0' }],
    }

    expect(hasPublicEventHighlights(incoming)).toBe(true)

    const merged = mergePublicEventHighlights({
      actionIds: [],
      farmTiles: [],
      fenceEdges: [],
    }, incoming)

    expect(merged).toEqual(incoming)
    expect(removePublicEventHighlights(merged, incoming)).toEqual({
      actionIds: [],
      farmTiles: [],
      fenceEdges: [],
    })

    const overlapped = mergePublicEventHighlights(merged, incoming)
    expect(removePublicEventHighlights(overlapped, incoming)).toEqual(incoming)
  })

  it('preserves action highlights for public events that do not produce notifications', () => {
    const workerPlaced = {
      schemaVersion: 1,
      id: 'evt-worker',
      seq: 1,
      round: 1,
      phase: 'work',
      visibility: 'public',
      actorPlayerId: 'p1',
      type: 'worker.placed',
      workerId: 'w1',
      spaceId: 'forest',
    } satisfies GameEvent

    const feedback = collectNewPublicEventFeedback([workerPlaced], 0, 'en', 'public-test')

    expect(feedback.notifications).toEqual([])
    expect(mergePublicEventHighlights({
      actionIds: [],
      farmTiles: [],
      fenceEdges: [],
    }, feedback.highlights).actionIds).toEqual(['forest'])
  })

  it('filters public farm highlights by viewed player', () => {
    expect(filterPublicFarmHighlightsForPlayer([
      { playerId: 'p1', key: '0-0' },
      { playerId: 'p2', key: '0-0' },
    ], 'p1')).toEqual(new Set(['0-0']))

    expect(filterPublicFenceHighlightsForPlayer([
      { playerId: 'p1', edgeId: 'h-0-0' },
      { playerId: 'p2', edgeId: 'h-0-0' },
    ], 'p2')).toEqual(new Set(['h-0-0']))
  })
})
