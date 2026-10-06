import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getActiveCardRegistry } from '../../shared/cards/active-registry'
import { rehydrateState, serializeSessionSnapshot, serializeState } from '../../shared/session/serialization'
import { frameForPerspective } from '../../replay-viewer/src/model'
import { buildRoomHistoryPage } from '../../shared/session/history-window'
import { filterSerializedStateForPlayer } from '../../shared/projections/serialized-state'
import type { GameEvent } from '../../shared/contract/events'

import { CARD_ID, visibilitySource, createVisibilitySession } from './_helpers/card-visibility'
const INTERNAL = 'INTERNAL_CARD_SENTINEL'
const PRIVATE = 'OWNER_CARD_SECRET'
const STACK = 'INTERNAL_STACK_SENTINEL'

const checkVisible = (value: unknown, owner: boolean) => {
  const json = JSON.stringify(value)
  for (const sentinel of [INTERNAL, STACK, '8675912']) expect(json.includes(sentinel), sentinel).toBe(false)
  if (owner) expect(json).toContain(PRIVATE)
  else expect(json).not.toContain(PRIVATE)
}

describe('explicit Card State visibility', () => {
  it('keeps generic internal/private writes out of public audit events and preserves recovery and undo behavior', () => {
    const session = createVisibilitySession()
    session.loadState(session.state)
    const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(saved))
    restored.withCtx(() => getActiveCardRegistry()!.loadImpl(CARD_ID, visibilitySource.impl))
    const response = session.takeAction(0, 'forest')
    const replayed = restored.takeAction(0, 'forest')
    expect(response.ok).toBe(true)
    expect(replayed.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(saved.state.players[0]!.resources.food + 1)
    expect(replayed.state.players[0]!.resources).toEqual(response.state.players[0]!.resources)
    expect(replayed.interaction).toEqual(response.interaction)
    const writes = response.state.events.filter((event) => event.type === 'card.stateChanged' && event.cardId === CARD_ID)
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.every((event) => !Object.hasOwn(event, 'value'))).toBe(true)
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'card.infoboxChanged', text: 'Updated public display' }))
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.moved', sourceCardId: CARD_ID, resources: { food: 1 } }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardInfoboxChanged' }))
    for (const viewer of ['p1', 'p2', null]) checkVisible(session.buildSyncPayload(response, viewer), viewer === 'p1')
    const undone = session.undoAction()
    expect(undone.ok).toBe(true)
    expect(undone.state.players[0]!.resources).toEqual(saved.state.players[0]!.resources)
    for (const viewer of ['p1', 'p2', null]) {
      checkVisible(session.buildSyncPayload(undone, viewer), viewer === 'p1')
      expect(JSON.stringify(buildRoomHistoryPage(session.withCtx(() => serializeState(undone.state, {})), viewer)).includes(INTERNAL)).toBe(false)
    }
  })
  it('redacts internal values in recorded events, cancellation archives and history pages without changing the full Frame', () => {
    const session = createVisibilitySession()
    const frame = session.withCtx(() => serializeState(session.state, {}))
    const event: GameEvent = { schemaVersion: 1, id: 'internal-write', seq: 2, round: 1, phase: 'work',
      type: 'card.stateChanged', visibility: 'public', cardId: CARD_ID, targetPlayerId: 'p1', key: 'internal', value: INTERNAL }
    frame.events.push(event)
    frame.nextEventSeq = 3
    frame.publicEventArchive.push({ schemaVersion: 1, id: '2', packetSeq: 2, type: 'publicEvents.canceled',
      reason: 'undoAction', previousMaxSeq: 2, nextMaxSeq: 1, canceledEvents: [event], canceledEventIds: [event.id], canceledSeqs: [event.seq] })
    frame.nextPublicEventArchivePacketSeq = 3
    const before = JSON.stringify(frame)
    for (const viewer of ['p1', 'p2', null]) {
      checkVisible(filterSerializedStateForPlayer(frame, viewer), viewer === 'p1')
      expect(JSON.stringify(buildRoomHistoryPage(frame, viewer)).includes(INTERNAL)).toBe(false)
    }
    const projected = filterSerializedStateForPlayer(frame, 'p1')
    expect(projected.events.find((item) => item.id === event.id)).toMatchObject({ type: 'card.stateChanged', key: 'internal' })
    expect(projected.events.find((item) => item.id === event.id)).not.toHaveProperty('value')
    expect(JSON.stringify(frame)).toBe(before)
  })
  it('sends only declared public facts and owner-private values in normal, dev and Replay seat views', () => {
    const session = createVisibilitySession()
    const before = JSON.stringify(session.state)
    for (const mode of ['viewer', 'dev-viewer'] as const) for (const viewer of ['p1', 'p2', null]) {
      const payload = session.buildSyncPayload(session.getState(), viewer, mode)
      checkVisible(payload, viewer === 'p1')
      expect(payload.state.players[0]!.cardStatePresentation[CARD_ID]).toEqual({
        counters: { visibleCount: 2 }, infobox: 'Public display', resourceGroups: [{ wood: 1, clay: 1 }],
      })
      expect(payload.state.players[0]!.cardStates).toEqual(viewer === 'p1' ? { [CARD_ID]: { privateData: { secret: PRIVATE } } } : {})
    }
    const frame = session.withCtx(() => serializeState(session.state, {}))
    checkVisible(frameForPerspective(frame, 'p1'), true)
    checkVisible(frameForPerspective(frame, 'p2'), false)
    expect(JSON.stringify(frameForPerspective(frame, 'open'))).toContain(INTERNAL)
    const recovery = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    for (const sentinel of [INTERNAL, PRIVATE, STACK, '8675912']) expect(JSON.stringify(recovery)).toContain(sentinel)
    expect(JSON.stringify(session.state)).toBe(before)
  })
})
