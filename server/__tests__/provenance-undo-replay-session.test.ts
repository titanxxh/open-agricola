import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { buildEnvelope } from '../connection/envelope-builder'
import { appendImmediateEvents } from '../../shared/events/append'

import '../../shared/cards/E/E78_SleightofHand'

const maxEventSeq = (events: Array<{ seq: number }>): number =>
  events.reduce((max, event) => Math.max(max, event.seq), 0)

const canceledEventsFrom = (
  beforeEvents: Array<{ id: string; seq: number }>,
  afterEvents: Array<{ id: string; seq: number }>,
): Array<{ id: string; seq: number }> => {
  const nextMaxSeq = maxEventSeq(afterEvents)
  const afterIds = new Set(afterEvents.map((event) => event.id))
  return beforeEvents.filter((event) =>
    event.seq > nextMaxSeq || !afterIds.has(event.id)
  ).sort((a, b) => a.seq - b.seq)
}

const cloneJson = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

describe('provenance undo/replay reconstruction', () => {
  it('undoAction removes E78 public events, derived log, and private prompt from the current view', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorHand = ['E78_SleightofHand']
    player.occupationPlayed = ['occ-1', 'occ-2', 'occ-3']
    player.resources.wood = 2
    player.resources.clay = 1
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    let resp = session.takeAction(0, 'meeting-place')
    for (let safety = 0; safety < 20; safety += 1) {
      expect(resp.ok).toBe(true)
      if (
        resp.interaction.stateId === 'wait' &&
        resp.interaction.request.kind === 'resource-batch-exchange-select'
      ) {
        break
      }
      if (resp.interaction.stateId !== 'wait') throw new Error('E78 batch prompt not reached')
      const next = resp.interaction.options?.find((option) => option.value !== '__skip__' && option.value !== 'cancel')
      if (!next) throw new Error('E78 batch prompt not reached')
      resp = session.resolveChoice(resp.interaction.playerIndex, next.value)
    }
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('resource-batch-exchange-select')
    const beforeUndoEnvelope = buildEnvelope({
      room: { id: 'r1', session },
      resp,
      viewerPlayerId: player.id,
      version: 1,
      cause: 'choice',
      emittedAt: 0,
    })
    expect(beforeUndoEnvelope.payload.privateEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'private.promptShown', sourceCard: 'E78_SleightofHand' }),
    ]))

    resp = session.commitSelectionChoice(0, {
      resourceBatchExchange: {
        discard: { wood: 2, clay: 1 },
        receive: { wood: 1, stone: 2 },
      },
    })
    expect(resp.ok).toBe(true)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.exchanged',
        sourceCardId: 'E78_SleightofHand',
      }),
    ]))
    const exchangedEvent = resp.state.events.find((event) =>
      event.type === 'resource.exchanged' &&
      event.sourceCardId === 'E78_SleightofHand'
    )
    expect(exchangedEvent).toBeDefined()
    const previousMaxSeq = maxEventSeq(resp.state.events)
    const beforeUndoEvents = [...resp.state.events]
    expect(resp.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.actionDetail' }),
    ]))

    resp = session.undoAction()
    expect(resp.ok).toBe(true)
    const expectedCanceledEvents = canceledEventsFrom(beforeUndoEvents, resp.state.events)
    expect(expectedCanceledEvents.map((event) => event.id)).toContain(exchangedEvent!.id)
    expect(resp.publicEventCancellations).toEqual([{
      reason: 'undoAction',
      previousMaxSeq,
      nextMaxSeq: maxEventSeq(resp.state.events),
      canceledEventIds: expectedCanceledEvents.map((event) => event.id),
      canceledSeqs: expectedCanceledEvents.map((event) => event.seq),
    }])
    const canceled = resp.publicEventCancellations![0]!
    expect('canceledEvents' in (canceled as Record<string, unknown>)).toBe(false)
    expect(resp.state.publicEventArchive.at(-1)).toMatchObject({
      type: 'publicEvents.canceled',
      reason: 'undoAction',
      canceledEventIds: canceled.canceledEventIds,
      canceledSeqs: canceled.canceledSeqs,
    })
    const canceledPacket = resp.state.publicEventArchive.at(-1)!
    if (canceledPacket.type !== 'publicEvents.canceled') {
      throw new Error('expected canceled archive packet')
    }
    expect(canceledPacket.canceledEvents.map((event) => event.id)).toEqual(canceled.canceledEventIds)
    expect(canceledPacket.canceledEvents.map((event) => event.seq)).toEqual(canceled.canceledSeqs)
    expect(canceledPacket.canceledEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.exchanged' }),
    ]))
    const afterUndoEventIds = new Set(resp.state.events.map((event) => event.id))
    expect(canceled.canceledSeqs.every((seq) =>
      seq > canceled.nextMaxSeq ||
      canceled.canceledEventIds.some((id) => !afterUndoEventIds.has(id))
    )).toBe(true)
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.exchanged',
        sourceCardId: 'E78_SleightofHand',
      }),
    ]))
    expect(resp.interaction.stateId).not.toBe('wait')
    const afterUndoEnvelope = buildEnvelope({
      room: { id: 'r1', session },
      resp,
      viewerPlayerId: player.id,
      version: 2,
      cause: 'undo',
      emittedAt: 1,
    })
    expect(afterUndoEnvelope.payload.privateEvents ?? []).toEqual([])
    expect(afterUndoEnvelope.payload.publicEventCancellations).toEqual(resp.publicEventCancellations)
    expect(session.getState().publicEventCancellations).toBeUndefined()
    const reconnectEnvelope = buildEnvelope({
      room: { id: 'r1', session },
      resp: session.getState(),
      viewerPlayerId: player.id,
      version: 3,
      cause: 'reconnect',
      emittedAt: 2,
    })
    expect(reconnectEnvelope.payload.publicEventCancellations).toBeUndefined()
  })

  it('undoStep cancels worker placement public events exactly', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    const placedEvent = resp.state.events.find((event) =>
      event.type === 'worker.placed' &&
      event.spaceId === 'day-laborer'
    )
    expect(placedEvent).toBeDefined()
    const beforeUndoEvents = [...resp.state.events]
    const previousMaxSeq = maxEventSeq(beforeUndoEvents)

    resp = session.undoStep()
    expect(resp.ok).toBe(true)
    const expectedCanceledEvents = canceledEventsFrom(beforeUndoEvents, resp.state.events)
    expect(resp.publicEventCancellations).toEqual([{
      reason: 'undoStep',
      previousMaxSeq,
      nextMaxSeq: maxEventSeq(resp.state.events),
      canceledEventIds: expectedCanceledEvents.map((event) => event.id),
      canceledSeqs: expectedCanceledEvents.map((event) => event.seq),
    }])
    const canceled = resp.publicEventCancellations![0]!
    expect(resp.state.publicEventArchive.at(-1)).toMatchObject({
      type: 'publicEvents.canceled',
      reason: 'undoStep',
      canceledEventIds: canceled.canceledEventIds,
      canceledSeqs: canceled.canceledSeqs,
    })
    const canceledPacket = resp.state.publicEventArchive.at(-1)!
    if (canceledPacket.type !== 'publicEvents.canceled') {
      throw new Error('expected canceled archive packet')
    }
    expect(canceledPacket.canceledEvents.map((event) => event.id)).toEqual(canceled.canceledEventIds)
    expect(canceledPacket.canceledEvents.map((event) => event.seq)).toEqual(canceled.canceledSeqs)
    expect(canceledPacket.canceledEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'worker.placed' }),
    ]))
    expect(expectedCanceledEvents.map((event) => event.id)).toContain(placedEvent!.id)
    expect(resp.state.events.some((event) => event.id === placedEvent!.id)).toBe(false)
  })

  it('undoStep preserves prior canceled archive packets across continuous public event undos', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    session.loadState(state)
    const liveState = session.getState().state

    session.appendHistory()
    appendImmediateEvents(liveState, [{
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: liveState.players[0]!.id },
      reason: 'gain',
    }])
    session.appendHistory()
    appendImmediateEvents(liveState, [{
      type: 'resource.moved',
      resources: { clay: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: liveState.players[0]!.id },
      reason: 'gain',
    }])

    const undoSecond = session.undoStep()
    expect(undoSecond.ok).toBe(true)
    expect(undoSecond.publicEventCancellations?.[0]?.canceledSeqs).toEqual([3])
    const archiveAfterSecondUndo = cloneJson(undoSecond.state.publicEventArchive)

    const undoFirst = session.undoStep()
    expect(undoFirst.ok).toBe(true)
    expect(undoFirst.publicEventCancellations?.[0]?.canceledSeqs).toEqual([2])
    expect(undoFirst.state.publicEventArchive.slice(0, archiveAfterSecondUndo.length))
      .toEqual(archiveAfterSecondUndo)
    expect(undoFirst.state.publicEventArchive.map((packet) => packet.packetSeq))
      .toEqual(undoFirst.state.publicEventArchive.map((_, index) => index + 1))
  })

  it('keeps archive packetSeq monotonic when undo allows event id and seq reuse', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const liveState = session.getState().state

    session.appendHistory()
    appendImmediateEvents(liveState, [{
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: liveState.players[0]!.id },
      reason: 'gain',
    }])
    const firstEvent = liveState.events.at(-1)!

    const undoFirst = session.undoStep()
    expect(undoFirst.ok).toBe(true)
    const firstCanceledPacket = undoFirst.state.publicEventArchive.at(-1)!
    if (firstCanceledPacket.type !== 'publicEvents.canceled') {
      throw new Error('expected first canceled archive packet')
    }
    expect(firstCanceledPacket.packetSeq).toBe(3)
    expect(firstCanceledPacket.canceledEventIds).toEqual([firstEvent.id])
    expect(firstCanceledPacket.canceledSeqs).toEqual([firstEvent.seq])
    expect(firstCanceledPacket.canceledEvents).toEqual([
      expect.objectContaining({ resources: { wood: 1 } }),
    ])

    const redoState = session.getState().state
    session.appendHistory()
    appendImmediateEvents(redoState, [{
      type: 'resource.moved',
      resources: { clay: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: redoState.players[0]!.id },
      reason: 'gain',
    }])
    const reusedEvent = redoState.events.at(-1)!
    expect({ id: reusedEvent.id, seq: reusedEvent.seq }).toEqual({
      id: firstEvent.id,
      seq: firstEvent.seq,
    })
    expect(redoState.publicEventArchive.at(-1)).toMatchObject({
      type: 'publicEvents.committed',
      packetSeq: 4,
      eventIds: [reusedEvent.id],
      eventSeqs: [reusedEvent.seq],
    })

    const undoReused = session.undoStep()
    expect(undoReused.ok).toBe(true)
    expect(undoReused.state.publicEventArchive.map((packet) => packet.packetSeq))
      .toEqual([1, 2, 3, 4, 5])
    const secondCanceledPacket = undoReused.state.publicEventArchive.at(-1)!
    if (secondCanceledPacket.type !== 'publicEvents.canceled') {
      throw new Error('expected second canceled archive packet')
    }
    expect(secondCanceledPacket.canceledEventIds).toEqual([reusedEvent.id])
    expect(secondCanceledPacket.canceledSeqs).toEqual([reusedEvent.seq])
    expect(secondCanceledPacket.canceledEvents).toEqual([
      expect.objectContaining({ resources: { clay: 1 } }),
    ])
    expect(undoReused.state.publicEventArchive[2]).toEqual(firstCanceledPacket)
  })

  it('failed undo leaves public event archive unchanged', () => {
    const session = new GameSession()
    const beforeArchive = cloneJson(session.getState().state.publicEventArchive)

    const failed = session.undoAction()

    expect(failed.ok).toBe(false)
    expect(session.getState().state.publicEventArchive).toEqual(beforeArchive)
  })

  it('undoStep does not append a canceled archive packet when no public event is removed', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    session.appendHistory()
    const beforeNoEventArchive = cloneJson(session.getState().state.publicEventArchive)

    const noEventUndo = session.undoStep()

    expect(noEventUndo.ok).toBe(true)
    expect(noEventUndo.publicEventCancellations).toBeUndefined()
    expect(noEventUndo.state.publicEventArchive).toEqual(beforeNoEventArchive)
    expect(noEventUndo.state.nextPublicEventArchivePacketSeq)
      .toBe(session.getState().state.nextPublicEventArchivePacketSeq)
  })

  it('undoStep still returns when canceled archive payload validation rejects a corrupted event', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const liveState = session.getState().state
    session.appendHistory()
    appendImmediateEvents(liveState, [{
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: liveState.players[0]!.id },
      reason: 'gain',
    }])
    const lastEvent = liveState.events.at(-1)!
    ;(lastEvent as { visibility: string }).visibility = 'private'
    const beforeArchive = cloneJson(liveState.publicEventArchive)
    const beforeCursor = liveState.nextPublicEventArchivePacketSeq

    const resp = session.undoStep()

    expect(resp.ok).toBe(true)
    expect(resp.publicEventCancellations?.[0]?.canceledEventIds).toEqual([lastEvent.id])
    expect(resp.state.publicEventArchive).toEqual(beforeArchive)
    expect(resp.state.nextPublicEventArchivePacketSeq).toBe(beforeCursor)
  })

  it('does not land undoStep when public event archive cursor is stale', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const liveState = session.getState().state
    session.appendHistory()
    appendImmediateEvents(liveState, [{
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: liveState.players[0]!.id },
      reason: 'gain',
    }])
    liveState.nextPublicEventArchivePacketSeq = 1
    const beforeEvents = cloneJson(liveState.events)
    const beforeArchive = cloneJson(liveState.publicEventArchive)

    expect(() => session.undoStep()).toThrow(/Invalid public event archive state/)
    expect(session.getState().state.events).toEqual(beforeEvents)
    expect(session.getState().state.publicEventArchive).toEqual(beforeArchive)
    expect(session.getState().state.nextPublicEventArchivePacketSeq).toBe(1)
  })

  it('does not land undoStep when live public event archive has duplicate packetSeq', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const liveState = session.getState().state
    session.appendHistory()
    appendImmediateEvents(liveState, [{
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: liveState.players[0]!.id },
      reason: 'gain',
    }])
    liveState.publicEventArchive = [
      ...liveState.publicEventArchive,
      { ...liveState.publicEventArchive[0]! },
    ]
    const beforeEvents = cloneJson(liveState.events)
    const beforeArchive = cloneJson(liveState.publicEventArchive)
    const beforeCursor = liveState.nextPublicEventArchivePacketSeq

    expect(() => session.undoStep()).toThrow(/Invalid public event archive state/)
    expect(session.getState().state.events).toEqual(beforeEvents)
    expect(session.getState().state.publicEventArchive).toEqual(beforeArchive)
    expect(session.getState().state.nextPublicEventArchivePacketSeq).toBe(beforeCursor)
  })

  it('does not land undoStep when live public event archive has non-json packet fields', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    const liveState = session.getState().state
    session.appendHistory()
    appendImmediateEvents(liveState, [{
      type: 'resource.moved',
      resources: { wood: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: liveState.players[0]!.id },
      reason: 'gain',
    }])
    const corruptedPacket = liveState.publicEventArchive[0] as Record<string, unknown>
    corruptedPacket.debug = () => 'bad'
    const beforeEvents = cloneJson(liveState.events)
    const beforeArchive = liveState.publicEventArchive
    const beforeCursor = liveState.nextPublicEventArchivePacketSeq

    expect(() => session.undoStep()).toThrow(/Invalid public event archive state/)
    expect(session.getState().state.events).toEqual(beforeEvents)
    expect(session.getState().state.publicEventArchive).toBe(beforeArchive)
    expect(typeof (session.getState().state.publicEventArchive[0] as Record<string, unknown>).debug).toBe('function')
    expect(session.getState().state.nextPublicEventArchivePacketSeq).toBe(beforeCursor)
  })
})
