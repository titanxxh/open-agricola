import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { reap } from '../../shared/actions/effects/reap'

import '../../shared/cards/D/D063_Lynchet'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'D063_Lynchet'

describe('D063_Lynchet session', () => {
  it('onAfterReap counts only adjacent harvested positions', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]

    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 1, vegetable: 1 },
        grainFields: 1,
        vegetableFields: 1,
        harvestedPositions: [
          { row: 1, col: 0 }, // adjacent to (0,0)
          { row: 1, col: 1 }, // adjacent to (0,1)
        ],
      },
    }
    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).not.toBeNull()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('counts only positions that are orthogonally adjacent to a room tile', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }]

    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 2 },
        grainFields: 2,
        vegetableFields: 0,
        harvestedPositions: [
          { row: 1, col: 0 }, // adjacent
          { row: 2, col: 2 }, // not adjacent
        ],
      },
    }
    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).not.toBeNull()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('end-to-end: reap with mixed fields populates harvestedPositions and listener counts adjacents', () => {
    // BGA fix scenario: 3 grain fields, only 2 of them adjacent to rooms.
    // Old summary-only counting could not distinguish which fields were
    // harvested when there are multiple grain fields with different
    // adjacencies. The new harvestedPositions field makes it precise.
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }]

    player.fields = [
      // adjacent (1,0); will produce 1 grain
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      // not adjacent (2,2); will produce 1 grain
      { row: 2, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
      // empty field; not harvested
      { row: 3, col: 0, stacks: [] },
    ]

    const result = reap(state, player)
    expect(result.type).toBe('ok')
    expect(result.reapSummary.harvestedPositions).toEqual([
      { row: 1, col: 0 },
      { row: 2, col: 2 },
    ])

    state.harvestReapSummary = { [player.id]: result.reapSummary }
    session.loadState(state)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).not.toBeNull()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('does not trigger when no fields were harvested', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }]
    state.harvestReapSummary = {
      [player.id]: { resources: {}, grainFields: 0, vegetableFields: 0, harvestedPositions: [] },
    }
    session.loadState(state)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('does not trigger when no harvested positions are adjacent to rooms', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }]
    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 1 },
        grainFields: 1,
        vegetableFields: 0,
        harvestedPositions: [{ row: 2, col: 2 }],
      },
    }
    session.loadState(state)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })
})
