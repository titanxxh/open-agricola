import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { plowAction } from '../../shared/actions/effects/plow'
import type { ActionFlow, ActionSpace } from '../../shared/contract/types'

import { D1_ZigzagHarrow } from '../../shared/cards/D/D1_ZigzagHarrow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('D1_ZigzagHarrow session', () => {
  const setupZigzagState = (withStable = false) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 0, col: 3, stacks: [] },
      { row: 1, col: 3, stacks: [] },
    ]
    player.roomTiles = [
      { row: 2, col: 0 },
      { row: 1, col: 0 },
    ]
    player.stableTiles = withStable ? [{ row: 1, col: 4 }] : []
    player.minorPlayed.push('D1_ZigzagHarrow')
    session.loadState(state)
    return { state, player }
  }

  const getD1PlowLeaf = (state: ReturnType<typeof setupZigzagState>['state'], player: ReturnType<typeof setupZigzagState>['player']) => {
    const flow = runCardEffectHook(state, player, 'D1_ZigzagHarrow', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('plow')
    return leaf
  }

  it('onBuy returns optional plow leaf restricted to raw zigzag candidates', () => {
    const { state, player } = setupZigzagState(true)
    const leaf = getD1PlowLeaf(state, player)
    expect(leaf.optional).toBe(true)
    expect(leaf.sourceCard).toBe('D1_ZigzagHarrow')
    expect(leaf.actionContext?.allowedTiles).toEqual([
      { row: 1, col: 4 },
      { row: -1, col: 2 },
    ])
  })

  it('D1 plow farm-select only offers zigzag selectable tiles', () => {
    const { state, player } = setupZigzagState()
    const leaf = getD1PlowLeaf(state, player)

    const result = plowAction.execute({
      state,
      player,
      space: { id: 'plow' } as ActionSpace,
      sourceCard: leaf.sourceCard,
      actionContext: leaf.actionContext,
    })

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('farm-select')
    if (result.request.kind !== 'farm-select') return
    expect(result.request.farm.selectableTiles.map((tile) => `${tile.row}-${tile.col}`)).toEqual(['1-4'])
  })

  it('D1 plow rejects non-zigzag tile', () => {
    const { state, player } = setupZigzagState()
    const leaf = getD1PlowLeaf(state, player)

    const result = plowAction.resolveChoice!(
      {
        state,
        player,
        space: { id: 'plow' } as ActionSpace,
        sourceCard: leaf.sourceCard,
        actionContext: leaf.actionContext,
        eventSink: { emit: () => undefined },
      },
      'confirm',
      { tile: { row: 1, col: 2 } },
    )

    expect(result.type).toBe('fail')
    expect(player.fields).not.toContainEqual({ row: 1, col: 2, stacks: [] })
  })

  describe('prerequisite', () => {
    it('blocks when player has fewer than 2 fields', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      expect(meetsCardPrerequisites(player, D1_ZigzagHarrow, state.round, state)).toBe(false)
    })

    it('allows when fields can complete a zigzag pattern', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
        { row: 1, col: 1, stacks: [] },
      ]
      expect(meetsCardPrerequisites(player, D1_ZigzagHarrow, state.round, state)).toBe(true)
    })

    it('allows when a raw zigzag candidate is occupied by a stable', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [
        { row: 0, col: 2, stacks: [] },
        { row: 0, col: 3, stacks: [] },
        { row: 1, col: 3, stacks: [] },
      ]
      player.stableTiles = [{ row: 1, col: 4 }]
      expect(meetsCardPrerequisites(player, D1_ZigzagHarrow, state.round, state)).toBe(true)
    })
  })
})
