import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../contract/events'
import type { GameState } from '../../contract/types'
import { EventStore } from '../store'

const makeState = (): GameState => ({
  round: 2,
  phase: 'playing',
  roundPhase: 'work',
  draft: null,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: [],
  log: [],
  events: [],
  nextEventSeq: 1,
  publicEventArchive: [],
  nextPublicEventArchivePacketSeq: 1,
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  enableCommunityDeck: false,
  workPhaseObtainedResources: {},
  completedFeedingPhases: 0,
})

const makeEvent = (overrides?: Partial<GameEvent>): GameEvent => ({
  schemaVersion: 1,
  id: '1',
  seq: 1,
  round: 2,
  phase: 'work',
  type: 'resource.moved',
  visibility: 'public',
  resources: { wood: 1 },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'gain',
  ...overrides,
} as GameEvent)

describe('EventStore', () => {
  it('completes leaf frames into transaction events without appending state', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({
      actorPlayerId: 'p1',
      sourceActionId: 'collect',
    })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 3 },
      from: { kind: 'actionSpace', spaceId: 'forest' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'collect',
    })
    const completed = frame.complete(state)
    expect(completed).toMatchObject([
      {
        schemaVersion: 1,
        id: '1',
        seq: 1,
        round: 2,
        phase: 'work',
        visibility: 'public',
        actorPlayerId: 'p1',
        sourceActionId: 'collect',
        type: 'resource.moved',
      },
    ])
    expect(store.currentTransactionEvents()).toHaveLength(1)
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
    expect(completed[0]).not.toHaveProperty('sourceCardId')
  })

  it('commits the whole transaction to state in seq order', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const first = store.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'collect' })
    first.sink.emit({
      type: 'resource.moved',
      resources: { wood: 3 },
      from: { kind: 'actionSpace', spaceId: 'forest' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'collect',
    })
    first.complete(state)
    const second = store.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'gain' })
    second.sink.emit({
      type: 'resource.moved',
      resources: { food: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    second.complete(state)
    const committed = store.commitTransaction(state)
    expect(committed.map((event) => event.seq)).toEqual([1, 2])
    expect(state.events.map((event) => event.seq)).toEqual([1, 2])
    expect(state.nextEventSeq).toBe(3)
  })

  it('archives committed public event packets', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'gain' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { clay: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    frame.complete(state)

    const committed = store.commitTransaction(state)

    expect(committed.map((event) => event.seq)).toEqual([1, 2])
    expect(state.publicEventArchive).toEqual([
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
    ])
    expect(state.nextPublicEventArchivePacketSeq).toBe(2)
  })

  it('does not archive rolled back transaction events', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({ actorPlayerId: 'p1' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    frame.complete(state)
    store.rollbackTransaction()

    expect(state.publicEventArchive).toEqual([])
    expect(state.nextPublicEventArchivePacketSeq).toBe(1)
  })

  it('rolls back event state when archive append fails', () => {
    const state = makeState()
    state.publicEventArchive = [{
      schemaVersion: 1,
      id: '1',
      packetSeq: 1,
      type: 'publicEvents.committed',
      eventIds: ['99'],
      eventSeqs: [99],
      firstEventSeq: 99,
      lastEventSeq: 99,
    }]
    state.nextPublicEventArchivePacketSeq = 1
    const beforeArchive = JSON.parse(JSON.stringify(state.publicEventArchive))
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'gain' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    frame.complete(state)

    expect(() => store.commitTransaction(state)).toThrow()
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
    expect(state.publicEventArchive).toEqual(beforeArchive)
    expect(state.nextPublicEventArchivePacketSeq).toBe(1)
    expect(store.currentTransactionEvents()).toHaveLength(1)

    state.nextPublicEventArchivePacketSeq = 2
    const committed = store.commitTransaction(state)
    expect(committed.map((event) => event.seq)).toEqual([1])
    expect(state.events).toHaveLength(1)
    expect(state.publicEventArchive).toHaveLength(2)
    expect(state.publicEventArchive.at(-1)).toMatchObject({
      packetSeq: 2,
      eventIds: ['1'],
      eventSeqs: [1],
    })
  })

  it('rolls back event state when archive cursor is stale but not duplicated', () => {
    const state = makeState()
    state.publicEventArchive = [{
      schemaVersion: 1,
      id: '7',
      packetSeq: 7,
      type: 'publicEvents.committed',
      eventIds: ['99'],
      eventSeqs: [99],
      firstEventSeq: 99,
      lastEventSeq: 99,
    }]
    state.nextPublicEventArchivePacketSeq = 3
    const beforeArchive = JSON.parse(JSON.stringify(state.publicEventArchive))
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'gain' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    frame.complete(state)

    expect(() => store.commitTransaction(state)).toThrow(/Invalid public event archive state/)
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
    expect(state.publicEventArchive).toEqual(beforeArchive)
    expect(state.nextPublicEventArchivePacketSeq).toBe(3)
    expect(store.currentTransactionEvents()).toHaveLength(1)
  })

  it('rolls back event state without normalizing malformed live archive state', () => {
    const state = makeState()
    const archiveState = state as GameState & { publicEventArchive: unknown }
    archiveState.publicEventArchive = { malformed: true }
    state.nextPublicEventArchivePacketSeq = 1
    const beforeArchive = archiveState.publicEventArchive
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'gain' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    frame.complete(state)

    expect(() => store.commitTransaction(state)).toThrow(/Invalid public event archive state/)
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
    expect(archiveState.publicEventArchive).toBe(beforeArchive)
    expect(state.nextPublicEventArchivePacketSeq).toBe(1)
    expect(store.currentTransactionEvents()).toHaveLength(1)
  })

  it('rebases completed transaction events if another transaction committed first', () => {
    const state = makeState()
    const store = new EventStore()
    const delayed = store.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'delayed' })
    delayed.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    expect(delayed.complete(state)[0]?.seq).toBe(1)

    const other = new EventStore()
    const immediate = other.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'immediate' })
    immediate.sink.emit({
      type: 'resource.moved',
      resources: { clay: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    immediate.complete(state)
    other.commitTransaction(state)

    const committed = store.commitTransaction(state)
    expect(state.events.map((event) => event.seq)).toEqual([1, 2])
    expect(state.events.map((event) => event.sourceActionId)).toEqual(['immediate', 'delayed'])
    expect(committed[0]).toMatchObject({ id: '2', seq: 2 })
    expect(state.nextEventSeq).toBe(3)
  })

  it('does not clear existing transaction events when ensuring an open transaction', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const first = store.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'collect' })
    first.sink.emit({
      type: 'resource.moved',
      resources: { wood: 3 },
      from: { kind: 'actionSpace', spaceId: 'forest' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'collect',
    })
    first.complete(state)
    store.ensureTransaction()
    const second = store.beginFrame({ actorPlayerId: 'p1', sourceActionId: 'gain' })
    second.sink.emit({
      type: 'resource.moved',
      resources: { food: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    second.complete(state)
    store.commitTransaction(state)
    expect(state.events.map((event) => event.seq)).toEqual([1, 2])
    expect(state.events).toHaveLength(2)
  })

  it('throws instead of clearing transaction events when beginning a transaction while open', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({ actorPlayerId: 'p1' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    frame.complete(state)
    expect(() => store.beginTransaction()).toThrow(/transaction/i)
    expect(store.currentTransactionEvents().map((event) => event.seq)).toEqual([1])
    const committed = store.commitTransaction(state)
    expect(committed.map((event) => event.seq)).toEqual([1])
    expect(state.events.map((event) => event.seq)).toEqual([1])
  })

  it('throws when completing a stale frame after rollback', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({ actorPlayerId: 'p1' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    store.rollbackTransaction()
    expect(() => frame.complete(state)).toThrow(/transaction/i)
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
    expect(store.currentTransactionEvents()).toEqual([])
  })

  it('throws when completing a stale frame after a new transaction starts', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const oldFrame = store.beginFrame({ actorPlayerId: 'p1' })
    oldFrame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    store.rollbackTransaction()
    store.beginTransaction()
    expect(() => oldFrame.complete(state)).toThrow(/transaction/i)
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
    expect(store.currentTransactionEvents()).toEqual([])
  })

  it('validates restored transaction events before commit', () => {
    const store = new EventStore()

    expect(() => store.restore({
      inTransaction: true,
      transactionEvents: [
        { ...makeEvent(), visibility: 'private' } as GameEvent,
      ],
    })).toThrow(/public/)
    expect(() => store.restore({
      inTransaction: true,
      transactionEvents: [
        { ...makeEvent(), privateHand: ['E1'] } as unknown as GameEvent,
      ],
    })).toThrow(/Unknown GameEvent field privateHand/)
    expect(() => store.restore({
      inTransaction: true,
      transactionEvents: [
        { ...makeEvent(), seq: -1 },
      ],
    })).toThrow(/seq/)
  })

  it('rejects nested private payloads while completing frames without polluting state', () => {
    const state = makeState()
    const store = new EventStore()
    const frame = store.beginFrame({ actorPlayerId: 'p1' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1', prompt: { kind: 'choose-card' } },
      reason: 'gain',
    } as never)

    expect(() => frame.complete(state)).toThrow(/to/)
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
  })

  it('rejects nested private payloads while committing without polluting state', () => {
    const state = makeState()
    const store = new EventStore()
    const internals = store as unknown as {
      inTransaction: boolean
      transactionEvents: GameEvent[]
    }
    internals.inTransaction = true
    internals.transactionEvents = [
      makeEvent({
        to: { kind: 'player', playerId: 'p1', minorHand: ['E1_PrivateCard'] } as never,
      }),
    ]

    expect(() => store.commitTransaction(state)).toThrow(/to/)
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
  })

  it('emits many drafts and returns void', () => {
    const state = makeState()
    const store = new EventStore()
    const frame = store.beginFrame({ actorPlayerId: 'p1' })
    const result = frame.sink.emitMany([
      {
        type: 'resource.moved',
        resources: { wood: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'gain',
      },
      {
        type: 'resource.moved',
        resources: { clay: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'gain',
      },
    ])
    const completed = frame.complete(state)
    expect(result).toBeUndefined()
    expect(completed.map((event) => event.seq)).toEqual([1, 2])
    expect(store.currentTransactionEvents()).toHaveLength(2)
  })

  it('rolls back an uncommitted frame', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({ actorPlayerId: 'p1' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { clay: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    frame.rollback()
    expect(store.currentTransactionEvents()).toEqual([])
    store.rollbackTransaction()
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
  })

  it('rolls back completed transaction events without consuming seq', () => {
    const state = makeState()
    const store = new EventStore()
    store.beginTransaction()
    const frame = store.beginFrame({ actorPlayerId: 'p1' })
    frame.sink.emit({
      type: 'resource.moved',
      resources: { clay: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: 'p1' },
      reason: 'gain',
    })
    frame.complete(state)
    store.rollbackTransaction()
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
    expect(store.currentTransactionEvents()).toEqual([])
  })
})
