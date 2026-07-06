// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../../shared/contract/events'
import {
  collectPublicEventFeedback,
  emptyPublicEventHighlightTargets,
} from '../public-event-notifications'
import {
  clearReplayFeedback,
  usePublicEventCuePresentation,
} from '../public-event-cue-presentation'

const workerPlaced = (id: string, seq: number, spaceId: string): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 1,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
  type: 'worker.placed',
  workerId: `${id}-worker`,
  spaceId,
})

const fieldPlowed = (id: string, seq: number, playerId: string, row: number, col: number): GameEvent => ({
  schemaVersion: 1,
  id,
  seq,
  round: 1,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: playerId,
  type: 'farm.fieldPlowed',
  fields: [{ playerId, row, col }],
})

describe('usePublicEventCuePresentation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('owns live, replay, cancellation, and viewer-scoped public event cues', () => {
    const live = workerPlaced('evt-live', 1, 'forest')
    const replay = workerPlaced('evt-replay', 2, 'clay-pit')
    const p1Farm = fieldPlowed('evt-p1-farm', 3, 'p1', 0, 0)
    const p2Farm = fieldPlowed('evt-p2-farm', 4, 'p2', 1, 1)

    const { result, rerender, unmount } = renderHook(
      ({ state, replayFeedback, displayPlayerId }) =>
        usePublicEventCuePresentation({
          state,
          locale: 'en',
          replayFeedback,
          displayPlayerId,
        }),
      {
        initialProps: {
          state: { events: [] },
          replayFeedback: clearReplayFeedback(),
          displayPlayerId: 'p1',
        },
      },
    )

    act(() => {
      rerender({
        state: { events: [live, p1Farm, p2Farm] },
        replayFeedback: collectPublicEventFeedback([replay], 'en', 'replay:test'),
        displayPlayerId: 'p1',
      })
    })

    expect(result.current.displayPublicEventHighlights.actionIds).toEqual(['clay-pit', 'forest'])
    expect(result.current.highlightedActionIds).toEqual(new Set(['clay-pit', 'forest']))
    expect(result.current.highlightedFarmTileKeys).toEqual(new Set(['0-0']))

    act(() => {
      vi.advanceTimersByTime(3200)
    })

    expect(result.current.displayPublicEventHighlights.actionIds).toEqual(['clay-pit'])

    act(() => {
      result.current.applySnapshotPublicEventCancellations({
        publicEventCancellations: [{
          reason: 'undoStep',
          previousMaxSeq: 4,
          nextMaxSeq: 1,
          canceledEventIds: ['evt-p1-farm', 'evt-p2-farm'],
          canceledSeqs: [3, 4],
        }],
        state: { events: [live] },
      })
    })

    act(() => {
      rerender({
        state: { events: [live] },
        replayFeedback: clearReplayFeedback(),
        displayPlayerId: 'p1',
      })
    })

    expect(result.current.displayPublicEventHighlights).toEqual(emptyPublicEventHighlightTargets())
    expect(result.current.displayPublicEventResourceAnimations).toEqual([])

    unmount()
  })
})
