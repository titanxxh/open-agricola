import { describe, expect, it } from 'vitest'
import { EngineStack } from '../../engine'
import type { GameEvent } from '../../contract/events'
import type { GameState } from '../../contract/types'
import { createInitialState, normalizeState } from '../state-bootstrap'
import { rehydrateState, serializeState } from '../serialization'

const makeEvent = (seq: number): GameEvent => ({
  schemaVersion: 1,
  id: String(seq),
  seq,
  round: 1,
  phase: 'work',
  type: 'resource.moved',
  visibility: 'public',
  resources: { wood: seq },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'gain',
})

describe('event state bootstrap', () => {
  it('initializes event state on new games', () => {
    const state = createInitialState(1, {
      playerCount: 2,
      playerNames: ['Alice', 'Bob'],
    })

    expect(state.events).toEqual([
      expect.objectContaining({ type: 'game.started', seq: 1 }),
    ])
    expect(state.nextEventSeq).toBe(2)
    expect(state.log).toEqual([{ key: 'log.startGame' }])
  })

  it('preserves initial event state in the round start snapshot', () => {
    const state = createInitialState(1, {
      playerCount: 2,
      playerNames: ['Alice', 'Bob'],
    })

    expect(state.roundStartSnapshot?.events).toEqual([
      expect.objectContaining({ type: 'game.started', seq: 1 }),
    ])
    expect(state.roundStartSnapshot?.nextEventSeq).toBe(2)
  })

  it('backfills event state for legacy raw states', () => {
    const state = createInitialState(1)
    const legacy = { ...state } as Omit<GameState, 'events' | 'nextEventSeq'> &
      Partial<Pick<GameState, 'events' | 'nextEventSeq'>>
    delete legacy.events
    delete legacy.nextEventSeq

    const normalized = normalizeState(legacy as GameState)

    expect(normalized.events).toEqual([])
    expect(normalized.nextEventSeq).toBe(1)
  })

  it('ignores malformed event entries when deriving next event seq', () => {
    const state = createInitialState(1)
    const raw = {
      ...state,
      events: [null, { seq: '8' }, { seq: Infinity }, makeEvent(3)],
    } as unknown as GameState

    let normalized: GameState | undefined
    expect(() => {
      normalized = normalizeState(raw)
    }).not.toThrow()

    expect(normalized?.events).not.toContain(null)
    expect(normalized?.nextEventSeq).toBe(4)
  })

  it('drops persisted events that are not public json-safe events', () => {
    const state = createInitialState(1)
    const privateEvent = { ...makeEvent(2), visibility: 'private' }
    const nonJsonEvent = { ...makeEvent(3), value: () => 1 }
    const oversizedEvent = { ...makeEvent(4), payload: 'x'.repeat(4096) }
    const raw = {
      ...state,
      events: [makeEvent(1), privateEvent, nonJsonEvent, oversizedEvent],
      nextEventSeq: 5,
    } as unknown as GameState

    const normalized = normalizeState(raw)

    expect(normalized.events).toEqual([makeEvent(1)])
    expect(normalized.nextEventSeq).toBe(5)
  })

  it('drops persisted events with nested private payloads', () => {
    const state = createInitialState(1)
    const nestedPrivate = {
      ...makeEvent(2),
      to: { kind: 'player', playerId: 'p1', prompt: { kind: 'choose-card' } },
    }
    const raw = {
      ...state,
      events: [makeEvent(1), nestedPrivate],
      nextEventSeq: 3,
    } as unknown as GameState

    const normalized = normalizeState(raw)
    const rehydrated = rehydrateState({
      ...raw,
      actionSpaces: [],
      roundStartSnapshot: null,
      engineStack: { frames: [] },
    } as never).state

    expect(normalized.events).toEqual([makeEvent(1)])
    expect(normalized.nextEventSeq).toBe(3)
    expect(rehydrated.events).toEqual([makeEvent(1)])
    expect(rehydrated.nextEventSeq).toBe(3)
  })

  it('preserves event state through serialize and rehydrate JSON roundtrip', () => {
    const state = createInitialState(1)
    const events = [makeEvent(1), makeEvent(2)]
    state.events = events
    state.nextEventSeq = 3

    const serialized = serializeState(state, { engineStack: new EngineStack() })
    const rehydrated = rehydrateState(JSON.parse(JSON.stringify(serialized))).state

    expect(rehydrated.events).toEqual(events)
    expect(rehydrated.nextEventSeq).toBe(3)
  })

  it.each([
    ['missing', undefined],
    ['equal to max seq', 8],
    ['below max seq', 4],
  ])('sets nextEventSeq to max seq plus one when raw nextEventSeq is %s', (_, nextEventSeq) => {
    const state = createInitialState(1)
    const raw = {
      ...state,
      events: [makeEvent(2), makeEvent(8)],
    } as GameState & { nextEventSeq?: number }
    if (typeof nextEventSeq === 'number') {
      raw.nextEventSeq = nextEventSeq
    } else {
      delete raw.nextEventSeq
    }

    const normalized = normalizeState(raw as GameState)

    expect(normalized.nextEventSeq).toBe(9)
  })

  it('preserves nextEventSeq when it is greater than max event seq', () => {
    const state = createInitialState(1)
    const raw = {
      ...state,
      events: [makeEvent(2), makeEvent(8)],
      nextEventSeq: 12,
    }

    const normalized = normalizeState(raw)

    expect(normalized.nextEventSeq).toBe(12)
  })
})
