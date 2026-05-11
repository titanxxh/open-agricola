import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { reap } from '../../shared/actions/effects/reap'
import { fieldIsEmpty } from '../../shared/domain/field'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/C/C6_StoneClearing'
import '../../shared/cards/D/D63_Lynchet'
import '../../shared/cards/A/A11_MudPatch'

/**
 * C6 Stone Clearing — full BGA alignment.
 *
 * BGA `C6_StoneClearing::onBuy` places 1 STONE meeple on each empty field;
 * those fields are considered planted until the next field-phase reap, where
 * the standard reap path moves the stone to the player's reserve.
 *
 * Implementation: onBuy directly pushes `{kind:'stone', remaining:1}` to each
 * empty `player.fields` entry. No leaf is returned — stone is granted by the
 * reap main path next harvest.
 */
describe('C6_StoneClearing session (BGA-aligned)', () => {
  const setupWithFields = (fields: Array<{ row: number; col: number; stacks: Array<{ kind: 'grain' | 'vegetable' | 'stone'; remaining: number }> }>) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C6_StoneClearing')
    player.fields = fields
    session.loadState(state)
    return session
  }

  it('onBuy returns no leaf and does not grant stone immediately', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!
    const beforeStone = player.resources.stone ?? 0

    const flow = runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')
    // `runCardEffectHook` coerces `undefined` return to `null` (card-effects.ts:253).
    expect(flow).toBeNull()

    // Stone NOT granted immediately — it lands at next reap.
    expect(player.resources.stone ?? 0).toBe(beforeStone)
  })

  it('onBuy pushes stone stack onto every empty field', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!

    runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')

    for (const f of player.fields) {
      expect(f.stacks).toEqual([{ kind: 'stone', remaining: 1 }])
      expect(fieldIsEmpty(f)).toBe(false)
    }
  })

  it('onBuy skips empty fields when player has none', () => {
    const session = setupWithFields([])
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')
    expect(flow).toBeNull()
    expect(player.fields).toEqual([])
  })

  it('onBuy does not stone-fill fields that already have crops', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 1, col: 2, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!

    runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')

    expect(player.fields[0]!.stacks).toEqual([{ kind: 'stone', remaining: 1 }])
    expect(player.fields[1]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(player.fields[2]!.stacks).toEqual([{ kind: 'stone', remaining: 1 }])
  })

  it('reap after C6 onBuy grants 1 stone per stone-bearing field and clears them', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!
    const beforeStone = player.resources.stone ?? 0

    runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')
    expect(player.fields.every((f) => f.stacks[0]?.kind === 'stone')).toBe(true)

    const result = reap(state, player)
    expect(result.type).toBe('ok')
    expect((player.resources.stone ?? 0) - beforeStone).toBe(2)
    expect(player.fields.every(fieldIsEmpty)).toBe(true)
    expect(result.reapSummary.harvestedPositions!.length).toBe(2)
    expect(result.reapSummary.grainFields).toBe(0)
    expect(result.reapSummary.vegetableFields).toBe(0)
    expect(result.reapSummary.resources.stone).toBe(2)
  })

  it('mixed grain + stone fields reap into both resources, grainFields counts only grain', () => {
    const session = setupWithFields([
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 1, col: 1, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ])
    const state = session.getState().state
    const player = state.players[0]!
    const beforeGrain = player.resources.grain ?? 0
    const beforeStone = player.resources.stone ?? 0

    runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')
    const result = reap(state, player)

    expect((player.resources.grain ?? 0) - beforeGrain).toBe(1)
    expect((player.resources.stone ?? 0) - beforeStone).toBe(2)
    expect(result.reapSummary.grainFields).toBe(1)
    expect(result.reapSummary.vegetableFields).toBe(0)
    expect(result.reapSummary.resources.stone).toBe(2)
    expect(result.reapSummary.harvestedPositions!.length).toBe(3)
  })
})

describe('C6_StoneClearing cross-card integration', () => {
  it('D63 Lynchet: stone fields adjacent to room tiles count for the food bonus', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C6_StoneClearing')
    player.minorPlayed.push('D63_Lynchet')

    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    player.fields = [
      { row: 1, col: 0, stacks: [] }, // orthogonally adjacent to (0,0)
      { row: 3, col: 3, stacks: [] }, // not adjacent to any room tile
    ]
    session.loadState(state)

    runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')
    expect(player.fields.every((f) => f.stacks[0]?.kind === 'stone')).toBe(true)

    const result = reap(state, player)
    expect(result.type).toBe('ok')

    state.harvestReapSummary = {
      ...(state.harvestReapSummary ?? {}),
      [player.id]: result.reapSummary,
    }

    const flow = runCardEffectHook(state, player, 'D63_Lynchet', 'onAfterReap')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.params?.food).toBe(1) // only (1,0) is adjacent
  })

  it('A11-style empty-field counters: stone-clearing fields are NOT empty', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C6_StoneClearing')
    player.fields = [
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
    ]
    session.loadState(state)

    expect(player.fields.every(fieldIsEmpty)).toBe(true)

    runCardEffectHook(state, player, 'C6_StoneClearing', 'onBuy')

    expect(player.fields.every((f) => !fieldIsEmpty(f))).toBe(true)
    expect(player.fields.every((f) => f.stacks[0]?.kind === 'stone')).toBe(true)
  })
})
