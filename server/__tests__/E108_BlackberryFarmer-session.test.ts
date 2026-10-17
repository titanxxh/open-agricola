import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/E/E108_BlackberryFarmer'
import '../../shared/cards/B/B030_WoodPalisades'
import assert from 'node:assert/strict'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

const CARD_ID = 'E108_BlackberryFarmer'

const fenceBuilt = (
  newFenceEdges: string[],
): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  fences: [
    ...newFenceEdges.map((edge) => ({ edge, type: 'fence' })),
    { edge: 'H-0-0', type: 'palisade' },
  ],
  newFenceEdges,
  newPastures: [{ tiles: [{ row: 0, col: 0 }] }],
})

describe('E108 Blackberry Farmer — session (palisades excluded)', () => {
  it('queues future meeples for fence edges only, not palisades', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5

    const player = state.players[0]!
    // 2 fences × 1 wood + 2 palisades × 2 wood = 6
    player.resources.wood = 6
    player.occupationPlayed.push(CARD_ID)
    player.minorPlayed.push('B030_WoodPalisades')

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Tile (0,0) fenced with 2 fences + 2 palisades
    // Palisades on border: H-0-0 (top), V-0-0 (left). Fences on internal: H-1-0, V-0-1.
    resp = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    // Only 2 future meeples queued (one per real fence), not 4.
    const futureForCard = resp.state.futureMeeples.filter(
      (m: { cardId?: string }) => m.cardId === CARD_ID,
    )
    expect(futureForCard).toHaveLength(2)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.fenceBuilt',
        newFenceEdges: ['H-1-0', 'V-0-1'],
      }),
    ]))
  })

  it('ignores legacy newFenceEdges extraData when fence event has only palisades', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    const listener = session.withCtx(() => getRegisteredCardListeners()).find((entry) => entry.id === 'E108-blackberry-farmer-after-fencing')
    expect(listener).toBeDefined()
    const actionEvents = [fenceBuilt([])]

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'fencing')!,
      actionId: 'fence',
      phase: 'after',
      result: { type: 'ok', extraData: { newFenceEdges: ['H-1-0', 'V-0-1'] } },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
    expect(state.pendingFutureMeeples.filter((entry) => entry.cardId === CARD_ID)).toEqual([])
  })
})

describe('ae-negative-47-cards', () => {
  const { sessions, save, ok, make, finish, ONE, fence, future, reach } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E108 N1 four real paid fences schedule one food for exactly next four rounds and naturally release only the next-round food', () => { const s = make('E108_BlackberryFarmer', st => { st.players[0]!.resources.wood = 4 }, true, 8), fenced = fence(s, ONE, false); assert.equal(fenced.state.players[0]!.resources.wood, 0); assert.deepEqual(future(fenced, 'E108_BlackberryFarmer'), [9, 10, 11, 12].map(round => ({ round, resources: { food: 1 } }))); const p = reach(s, 9), r = finish(s, p, false); assert.equal(r.state.players[0]!.resources.food, 103); assert.deepEqual(future(r, 'E108_BlackberryFarmer').map(e => e.round), [10, 11, 12]); save('E108-N1', { fenced, p, r }) })
  it('E108 N2 round twelve schedules only thirteen fourteen and round fourteen hand-only or nonfencing actions cannot schedule extra food', () => { for (const round of [12, 14]) { const s = make('E108_BlackberryFarmer', st => { st.players[0]!.resources.wood = 4 }, true, round), r = fence(s, ONE, false); assert.deepEqual(future(r, 'E108_BlackberryFarmer'), (round === 12 ? [13, 14] : []).map(round => ({ round, resources: { food: 1 } }))); save(`E108-N2-${round}`, r) } const c = make('E108_BlackberryFarmer', st => { st.players[0]!.resources.wood = 4 }, false), cr = fence(c, ONE, false); assert.equal(future(cr, 'E108_BlackberryFarmer').length, 0); const w = make('E108_BlackberryFarmer'), wr = finish(w, ok(w.takeAction(0, 'grain-seeds')), false); assert.equal(future(wr, 'E108_BlackberryFarmer').length, 0); save('E108-N2-controls', { cr, wr }) })
})
