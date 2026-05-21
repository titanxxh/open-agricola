import { describe, expect, it } from 'vitest'
import { EngineStack } from '../../engine'
import type { GameEvent } from '../../contract/events'
import type { GameState } from '../../contract/types'
import { appendImmediateEvents } from '../../events/append'
import { appendPublicEventCanceledPacket } from '../../events/archive'
import { createInitialState, normalizeState } from '../state-bootstrap'
import { rehydrateState, serializeState, serializeStateForPlayer } from '../serialization'

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

  it('initializes public event archive state on new games', () => {
    const state = createInitialState(1, {
      playerCount: 2,
      playerNames: ['Alice', 'Bob'],
    })

    expect(state.publicEventArchive).toEqual([
      expect.objectContaining({
        schemaVersion: 1,
        id: '1',
        packetSeq: 1,
        type: 'publicEvents.committed',
        eventIds: ['1'],
        eventSeqs: [1],
        firstEventSeq: 1,
        lastEventSeq: 1,
      }),
    ])
    expect(state.nextPublicEventArchivePacketSeq).toBe(2)
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

  it('backfills public event archive state for legacy raw states', () => {
    const state = createInitialState(1)
    const legacy = { ...state } as GameState & {
      publicEventArchive?: unknown
      nextPublicEventArchivePacketSeq?: unknown
    }
    delete legacy.publicEventArchive
    delete legacy.nextPublicEventArchivePacketSeq

    const normalized = normalizeState(legacy as GameState)

    expect(normalized.publicEventArchive).toEqual([])
    expect(normalized.nextPublicEventArchivePacketSeq).toBe(1)
  })

  it('drops malformed public event archive packets and advances packet seq', () => {
    const state = createInitialState(1)
    const valid = {
      schemaVersion: 1,
      id: '1',
      packetSeq: 1,
      type: 'publicEvents.committed',
      eventIds: ['2'],
      eventSeqs: [2],
      firstEventSeq: 2,
      lastEventSeq: 2,
    }
    const raw = {
      ...state,
      publicEventArchive: [
        null,
        { type: 'publicEvents.committed', packetSeq: 'bad' },
        valid,
        { ...valid },
      ],
      nextPublicEventArchivePacketSeq: 4,
    } as unknown as GameState

    const normalized = normalizeState(raw)

    expect(normalized.publicEventArchive).toEqual([valid])
    expect(normalized.nextPublicEventArchivePacketSeq).toBe(2)
  })

  it('drops public event archive packets after seq gaps or out-of-order entries', () => {
    const state = createInitialState(1)
    const packet = (packetSeq: number) => ({
      schemaVersion: 1,
      id: String(packetSeq),
      packetSeq,
      type: 'publicEvents.committed',
      eventIds: [String(packetSeq)],
      eventSeqs: [packetSeq],
      firstEventSeq: packetSeq,
      lastEventSeq: packetSeq,
    })

    expect(normalizeState({
      ...state,
      publicEventArchive: [packet(1), packet(3)],
      nextPublicEventArchivePacketSeq: 4,
    } as unknown as GameState).publicEventArchive).toEqual([packet(1)])

    expect(normalizeState({
      ...state,
      publicEventArchive: [packet(2), packet(1)],
      nextPublicEventArchivePacketSeq: 3,
    } as unknown as GameState).publicEventArchive).toEqual([packet(1)])
  })

  it('drops public event archive packets with unsafe top-level shapes', () => {
    const state = createInitialState(1)
    const base = {
      schemaVersion: 1,
      id: '2',
      packetSeq: 2,
      type: 'publicEvents.committed',
      eventIds: ['2'],
      eventSeqs: [2],
      firstEventSeq: 2,
      lastEventSeq: 2,
    }
    const nonJsonPacket = { ...base } as Record<string, unknown>
    Object.setPrototypeOf(nonJsonPacket, null)
    const raw = {
      ...state,
      publicEventArchive: [
        { ...base, extra: true },
        { ...base, id: '3' },
        { ...base, eventSeqs: [3] },
        { ...base, firstEventSeq: 1 },
        nonJsonPacket,
      ],
      nextPublicEventArchivePacketSeq: 3,
    } as unknown as GameState

    const normalized = normalizeState(raw)

    expect(normalized.publicEventArchive).toEqual([])
    expect(normalized.nextPublicEventArchivePacketSeq).toBe(1)
  })

  it('drops public event archive packets with invalid seq semantics', () => {
    const state = createInitialState(1)
    const committedBase = {
      schemaVersion: 1,
      id: '2',
      packetSeq: 2,
      type: 'publicEvents.committed',
      eventIds: ['2', '3'],
      eventSeqs: [3, 2],
      firstEventSeq: 3,
      lastEventSeq: 2,
    }
    const canceledBase = {
      schemaVersion: 1,
      id: '3',
      packetSeq: 3,
      type: 'publicEvents.canceled',
      reason: 'undoStep',
      previousMaxSeq: 2,
      nextMaxSeq: 3,
      canceledEventIds: ['2'],
      canceledSeqs: [2],
      canceledEvents: [makeEvent(2)],
    }
    const raw = {
      ...state,
      publicEventArchive: [committedBase, canceledBase],
      nextPublicEventArchivePacketSeq: 4,
    } as unknown as GameState

    const normalized = normalizeState(raw)

    expect(normalized.publicEventArchive).toEqual([])
    expect(normalized.nextPublicEventArchivePacketSeq).toBe(1)
  })

  it('keeps canceled archive packets for reused seqs when the event id is no longer current', () => {
    const state = createInitialState(1)
    const committed = {
      schemaVersion: 1,
      id: '1',
      packetSeq: 1,
      type: 'publicEvents.committed',
      eventIds: ['1'],
      eventSeqs: [1],
      firstEventSeq: 1,
      lastEventSeq: 1,
    }
    const valid = {
      schemaVersion: 1,
      id: '2',
      packetSeq: 2,
      type: 'publicEvents.canceled',
      reason: 'undoStep',
      previousMaxSeq: 3,
      nextMaxSeq: 2,
      canceledEventIds: ['2'],
      canceledSeqs: [2],
      canceledEvents: [makeEvent(2)],
    }
    const raw = {
      ...state,
      publicEventArchive: [committed, valid],
      nextPublicEventArchivePacketSeq: 3,
    } as unknown as GameState

    const normalized = normalizeState(raw)

    expect(normalized.publicEventArchive).toEqual([committed, valid])
    expect(normalized.nextPublicEventArchivePacketSeq).toBe(3)
  })

  it('drops canceled archive packets containing unsafe event payloads', () => {
    const state = createInitialState(1)
    const privateEvent = { ...makeEvent(2), visibility: 'private' }
    const nonJsonEvent = { ...makeEvent(3), value: () => 1 }
    const oversizedEvent = { ...makeEvent(4), reason: 'x'.repeat(4096) }
    const nestedPrivate = {
      ...makeEvent(5),
      to: { kind: 'player', playerId: 'p1', prompt: { kind: 'choose-card' } },
    }
    const packetFor = (event: unknown, packetSeq: number) => ({
      schemaVersion: 1,
      id: String(packetSeq),
      packetSeq,
      type: 'publicEvents.canceled',
      reason: 'undoAction',
      previousMaxSeq: packetSeq,
      nextMaxSeq: packetSeq - 1,
      canceledEventIds: [String(packetSeq)],
      canceledSeqs: [packetSeq],
      canceledEvents: [event],
    })
    const raw = {
      ...state,
      publicEventArchive: [
        packetFor(privateEvent, 2),
        packetFor(nonJsonEvent, 3),
        packetFor(oversizedEvent, 4),
        packetFor(nestedPrivate, 5),
      ],
      nextPublicEventArchivePacketSeq: 6,
    } as unknown as GameState

    const normalized = normalizeState(raw)

    expect(normalized.publicEventArchive).toEqual([])
    expect(normalized.nextPublicEventArchivePacketSeq).toBe(1)
  })

  it('drops canceled archive packets whose ids and seqs do not match their events', () => {
    const state = createInitialState(1)
    const raw = {
      ...state,
      publicEventArchive: [
        {
          schemaVersion: 1,
          id: '2',
          packetSeq: 2,
          type: 'publicEvents.canceled',
          reason: 'undoStep',
          previousMaxSeq: 2,
          nextMaxSeq: 1,
          canceledEventIds: ['3'],
          canceledSeqs: [2],
          canceledEvents: [makeEvent(2)],
        },
        {
          schemaVersion: 1,
          id: '3',
          packetSeq: 3,
          type: 'publicEvents.canceled',
          reason: 'undoStep',
          previousMaxSeq: 3,
          nextMaxSeq: 2,
          canceledEventIds: ['3'],
          canceledSeqs: [2],
          canceledEvents: [makeEvent(3)],
        },
      ],
      nextPublicEventArchivePacketSeq: 4,
    } as unknown as GameState

    const normalized = normalizeState(raw)

    expect(normalized.publicEventArchive).toEqual([])
    expect(normalized.nextPublicEventArchivePacketSeq).toBe(1)
  })

  it('rejects invalid runtime canceled archive event payloads without changing archive state', () => {
    const cases: GameEvent[] = [
      { ...makeEvent(2), visibility: 'private' } as GameEvent,
      { ...makeEvent(2), trigger: { phase: (() => 'bad') as unknown as string } } as GameEvent,
      { ...makeEvent(2), reason: 'x'.repeat(4096) },
    ]

    for (const event of cases) {
      const state = createInitialState(1)
      const beforeArchive = JSON.parse(JSON.stringify(state.publicEventArchive))
      const beforeCursor = state.nextPublicEventArchivePacketSeq

      expect(() => appendPublicEventCanceledPacket(state, {
        reason: 'undoAction',
        previousMaxSeq: event.seq,
        nextMaxSeq: 1,
        canceledEventIds: [event.id],
        canceledSeqs: [event.seq],
        canceledEvents: [event],
      })).toThrow()
      expect(state.publicEventArchive).toEqual(beforeArchive)
      expect(state.nextPublicEventArchivePacketSeq).toBe(beforeCursor)
    }
  })

  it('rejects malformed live archive state during runtime append', () => {
    const state = createInitialState(1)
    const duplicatedPacket = { ...state.publicEventArchive[0]! }
    state.publicEventArchive = [state.publicEventArchive[0]!, duplicatedPacket]
    state.nextPublicEventArchivePacketSeq = 2
    const beforeArchive = JSON.parse(JSON.stringify(state.publicEventArchive))

    expect(() => appendPublicEventCanceledPacket(state, {
      reason: 'undoStep',
      previousMaxSeq: 2,
      nextMaxSeq: 1,
      canceledEventIds: ['2'],
      canceledSeqs: [2],
      canceledEvents: [makeEvent(2)],
    })).toThrow(/Invalid public event archive state/)
    expect(state.publicEventArchive).toEqual(beforeArchive)
    expect(state.nextPublicEventArchivePacketSeq).toBe(2)
  })

  it('rejects stale live archive cursor during runtime append', () => {
    const state = createInitialState(1)
    state.nextPublicEventArchivePacketSeq = 1
    const beforeArchive = JSON.parse(JSON.stringify(state.publicEventArchive))

    expect(() => appendImmediateEvents(state, [{
      type: 'resource.moved',
      resources: { clay: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    }])).toThrow(/Invalid public event archive state/)
    expect(state.publicEventArchive).toEqual(beforeArchive)
    expect(state.nextPublicEventArchivePacketSeq).toBe(1)
  })

  it('rejects gapped live archive state during runtime append', () => {
    const state = createInitialState(1)
    state.publicEventArchive = [
      state.publicEventArchive[0]!,
      {
        schemaVersion: 1,
        id: '3',
        packetSeq: 3,
        type: 'publicEvents.committed',
        eventIds: ['2'],
        eventSeqs: [2],
        firstEventSeq: 2,
        lastEventSeq: 2,
      },
    ]
    state.nextPublicEventArchivePacketSeq = 4
    const beforeArchive = JSON.parse(JSON.stringify(state.publicEventArchive))

    expect(() => appendImmediateEvents(state, [{
      type: 'resource.moved',
      resources: { clay: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    }])).toThrow(/Invalid public event archive state/)
    expect(state.publicEventArchive).toEqual(beforeArchive)
    expect(state.nextPublicEventArchivePacketSeq).toBe(4)
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
    state.publicEventArchive = [
      {
        schemaVersion: 1,
        id: '1',
        packetSeq: 1,
        type: 'publicEvents.committed',
        eventIds: ['1', '2'],
        eventSeqs: [1, 2],
        firstEventSeq: 1,
        lastEventSeq: 2,
      },
      {
        schemaVersion: 1,
        id: '2',
        packetSeq: 2,
        type: 'publicEvents.canceled',
        reason: 'undoAction',
        previousMaxSeq: 2,
        nextMaxSeq: 1,
        canceledEventIds: ['2'],
        canceledSeqs: [2],
        canceledEvents: [makeEvent(2)],
      },
    ]
    state.nextPublicEventArchivePacketSeq = 3

    const serialized = serializeState(state, { engineStack: new EngineStack() })
    const rehydrated = rehydrateState(JSON.parse(JSON.stringify(serialized))).state

    expect(rehydrated.events).toEqual(events)
    expect(rehydrated.nextEventSeq).toBe(3)
    expect(rehydrated.publicEventArchive).toEqual(state.publicEventArchive)
    expect(rehydrated.nextPublicEventArchivePacketSeq).toBe(3)

    appendImmediateEvents(rehydrated, [{
      type: 'resource.moved',
      resources: { clay: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    }])
    expect(rehydrated.publicEventArchive.at(-1)).toMatchObject({
      type: 'publicEvents.committed',
      packetSeq: 3,
    })
    expect(rehydrated.nextPublicEventArchivePacketSeq).toBe(4)
  })

  it('preserves public event archive in per-viewer snapshots', () => {
    const state = createInitialState(1)
    state.publicEventArchive = [
      {
        schemaVersion: 1,
        id: '1',
        packetSeq: 1,
        type: 'publicEvents.committed',
        eventIds: ['1'],
        eventSeqs: [1],
        firstEventSeq: 1,
        lastEventSeq: 1,
      },
      {
        schemaVersion: 1,
        id: '2',
        packetSeq: 2,
        type: 'publicEvents.canceled',
        reason: 'undoStep',
        previousMaxSeq: 2,
        nextMaxSeq: 1,
        canceledEventIds: ['2'],
        canceledSeqs: [2],
        canceledEvents: [makeEvent(2)],
      },
    ]

    const p1 = state.players[0]!.id
    const p2 = state.players[1]!.id

    expect(serializeStateForPlayer(state, p1, { engineStack: new EngineStack() }).publicEventArchive)
      .toEqual(state.publicEventArchive)
    expect(serializeStateForPlayer(state, p2, { engineStack: new EngineStack() }).publicEventArchive)
      .toEqual(state.publicEventArchive)
    expect(serializeStateForPlayer(state, null, { engineStack: new EngineStack() }).publicEventArchive)
      .toEqual(state.publicEventArchive)
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
