import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/C/C106_PotatoHarvester'
import type { ActionFlow } from '../../shared/contract/types'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import assert from 'node:assert/strict'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

const CARD_ID = 'C106_PotatoHarvester'

describe('C106_PotatoHarvester session', () => {
  const setupForHarvest = (options: {
    vegetableFields?: { row: number; col: number; crop: 'vegetable'; remaining: number }[]
    grainFields?: { row: number; col: number; crop: 'grain'; remaining: number }[]
  }) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    player.fields = [
      ...(options.vegetableFields ?? []),
      ...(options.grainFields ?? []),
    ]

    // Set workers to 0 for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough to feed
    })

    session.loadState(state)
    return session
  }

  it('onBuy grants 3 food', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onBuy'))
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 3 })
  })

  it('onAfterReap grants 1 food per vegetable harvested', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 3 }, grainFields: 0, vegetableFields: 3 },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(1)
    expect(children[0].actionId).toBe('gain')
    expect(children[0].params).toEqual({ food: 3 })
  })

  it('onAfterReap does not trigger when no vegetables harvested', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 2 }, grainFields: 2, vegetableFields: 0 },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeNull()
  })


  it('integration: harvest with 2 vegetable fields gains 2 food', () => {
    const session = setupForHarvest({
      vegetableFields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
    })

    const foodBefore = session.getState().state.players[0]!.resources.food

    autoAdvanceRoundEnd(session, {
      onChoice: (intx, sess) =>
        sess.resolveChoice(intx.playerIndex, 'ok'),
    })

    const player = session.getState().state.players[0]!
    // 2 veg harvested => +2 food from card, -2 food for feeding 1 family
    expect(player.resources.food).toBe(foodBefore + 2 - 2)
  })

  it('integration: harvest with only grain fields does not trigger', () => {
    const session = setupForHarvest({
      grainFields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
      ],
    })

    const foodBefore = session.getState().state.players[0]!.resources.food

    autoAdvanceRoundEnd(session)

    const player = session.getState().state.players[0]!
    // Only grain harvested, no bonus food from card. -2 for feeding.
    expect(player.resources.food).toBe(foodBefore - 2)
  })
})

describe('ae-negative-47-cards', () => {
  const { sessions, save, ok, make, finish, lesson, end, fields } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C106 N1 actual first Lessons immediately grants exactly three food', () => { const s = make('C106_PotatoHarvester', undefined, false), r = finish(s, lesson(s, 'C106_PotatoHarvester'), false); assert.equal(r.state.players[0]!.resources.food, 103); assert.equal(r.state.players[1]!.resources.food, 100); save('C106-N1', r) })
  it('C106 N2 harvesting two vegetable fields grants exactly two additional food while grain fields and Vegetable Seeds do not', () => { const s = make('C106_PotatoHarvester', st => fields(st, 2, 'vegetable'), true, 4), r = finish(s, end(s), false); assert.equal(r.state.players[0]!.resources.vegetable, 2); assert.equal(r.state.players[0]!.resources.food, 98); const c = make('C106_PotatoHarvester', st => fields(st, 2, 'grain'), true, 4), cr = finish(c, end(c), false); assert.equal(cr.state.players[0]!.resources.grain, 2); assert.equal(cr.state.players[0]!.resources.food, 96); const w = make('C106_PotatoHarvester', undefined, true, 14), wr = finish(w, ok(w.takeAction(0, 'vegetable-seeds')), false); assert.equal(wr.state.players[0]!.resources.vegetable, 1); assert.equal(wr.state.players[0]!.resources.food, 100); save('C106-N2', { r, cr, wr }) })
})
