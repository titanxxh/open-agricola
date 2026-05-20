import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { buildEnvelope } from '../connection/envelope-builder'

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
    expect(expectedCanceledEvents.map((event) => event.id)).toContain(placedEvent!.id)
    expect(resp.state.events.some((event) => event.id === placedEvent!.id)).toBe(false)
  })
})
