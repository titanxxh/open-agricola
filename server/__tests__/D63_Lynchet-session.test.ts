import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D63_Lynchet'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'D63_Lynchet'

describe('D63_Lynchet session', () => {
  it('onAfterReap gives 1 food per harvested field adjacent to house', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5

    // House at (0,0) and (0,1)
    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    // Field at (1,0) — adjacent to room (0,0)
    // Field at (1,1) — adjacent to room (0,1)
    // Both still have crop after reap (remaining > 0)
    player.fields = [
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 1, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]

    // Reap summary: 2 fields harvested
    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1, vegetable: 1 }, grainFields: 1, vegetableFields: 1 },
    }

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('gives food only for fields adjacent to rooms', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5

    // House at (0,0)
    player.roomTiles = [{ row: 0, col: 0 }]
    // Field at (1,0) — adjacent to room (0,0)
    // Field at (2,2) — NOT adjacent to any room
    player.fields = [
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 2, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1, vegetable: 1 }, grainFields: 1, vegetableFields: 1 },
    }

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('handles depleted fields (remaining went to 0) adjacent to rooms', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5

    // House at (0,0)
    player.roomTiles = [{ row: 0, col: 0 }]
    // Field at (1,0) — adjacent to room, was depleted (crop=null, remaining=0 after reap)
    // Field at (2,2) — NOT adjacent
    player.fields = [
      { row: 1, col: 0, stacks: [] },
      { row: 2, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]

    // 2 total harvested (1 grain from field that still has crop + 1 that was depleted)
    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 2 }, grainFields: 2, vegetableFields: 0 },
    }

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    // 1 depleted field adjacent to room + 0 still-sown fields adjacent to room = 1
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('does not trigger when no fields were harvested', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    player.roomTiles = [{ row: 0, col: 0 }]
    player.fields = []

    state.harvestReapSummary = {
      [player.id]: { resources: {}, grainFields: 0, vegetableFields: 0 },
    }

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })


  it('does not trigger when no harvested fields are adjacent to rooms', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // House at (0,0)
    player.roomTiles = [{ row: 0, col: 0 }]
    // Field at (2,2) — NOT adjacent to room
    player.fields = [{ row: 2, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] }]

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })
})
