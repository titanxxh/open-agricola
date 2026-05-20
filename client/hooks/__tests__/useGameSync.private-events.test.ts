/* @vitest-environment jsdom */
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EngineStack } from '../../../shared/engine'
import type { GameSyncPayload, PrivateGameEvent } from '../../../shared/contract/protocol/game'
import { serializeState } from '../../../shared/session/serialization'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import { useGameSync } from '../useGameSync'

const buildPayload = (privateEvents?: PrivateGameEvent[]): GameSyncPayload => ({
  state: serializeState(createInitialState(42), { engineStack: new EngineStack() }),
  interaction: {
    stateId: 'idle',
    allowedCommands: [],
    anytimeActions: [],
  },
  ...(privateEvents ? { privateEvents } : {}),
  scores: null,
  historyLength: 0,
  hasActionStartSnapshot: false,
  ok: true,
})

describe('useGameSync private events', () => {
  it('stores private events from snapshots and clears them when omitted', () => {
    const privateEvents: PrivateGameEvent[] = [{
      schemaVersion: 1,
      type: 'private.handChanged',
      recipientPlayerId: 'p1',
      cardIds: ['A116_WoodCutter'],
      cardType: 'occupation',
      reason: 'card-effect',
    }]

    const { result } = renderHook(() => useGameSync())

    act(() => {
      result.current.applySnapshot(buildPayload(privateEvents))
    })
    expect(result.current.privateEvents).toEqual(privateEvents)

    act(() => {
      result.current.applySnapshot(buildPayload())
    })
    expect(result.current.privateEvents).toEqual([])
  })
})
