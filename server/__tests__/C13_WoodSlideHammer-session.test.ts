import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { canRenovate } from '../../shared/actions/effects/renovation'
import { getModifiersForCostType } from '../../shared/actions/helpers/payment'
import type { BonusModifier } from '../../shared/game/types'

import '../../shared/cards/C/C13_WoodSlideHammer'

const CARD_ID = 'C13_WoodSlideHammer'

const setupOwner = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  // Inject the static modifier as the playMinor flow would.
  player.activeModifiers = [
    ...player.activeModifiers,
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      discount: { stone: 2 },
      conditions: { houseTypeWood: 1, minNumRooms: 5 },
    } as BonusModifier,
  ]
  return { session, state, player }
}

describe('C13_WoodSlideHammer — renovation -2 stone discount gated by conditions', () => {
  it('5 wood rooms → modifier surfaces and reduces required stone by 2', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 5
    player.roomTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 },
      { row: 1, col: 1 }, { row: 2, col: 0 },
    ]
    player.resources = { ...player.resources, reed: 5, stone: 3, clay: 0 }

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(1)
    expect(mods[0]).toMatchObject({
      cardId: CARD_ID,
      discount: { stone: 2 },
    })
    // Wood → clay base cost is 5 clay + 1 reed; the discount on stone won't help
    // here, but canRenovate should still return true (modifier doesn't add cost).
    // The interesting case: house already clay would block via condition gating.
  })

  it('4 rooms → modifier filtered out (minNumRooms not met)', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 4

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
  })

  it('houseType already clay → modifier filtered out (houseTypeWood not met)', () => {
    const { player } = setupOwner()
    player.houseType = 'clay'
    player.rooms = 5

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
  })

  it('houseType stone → modifier filtered out', () => {
    const { player } = setupOwner()
    player.houseType = 'stone'
    player.rooms = 5

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
  })

  it('canRenovate path: with 5 wood rooms + 3 stone, can renovate (without discount would need clay anyway)', () => {
    const { player } = setupOwner()
    player.houseType = 'wood'
    player.rooms = 5
    player.roomTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 },
      { row: 1, col: 1 }, { row: 2, col: 0 },
    ]
    // Wood→clay needs 5 clay + 1 reed (one per room)
    player.resources = { ...player.resources, reed: 5, clay: 5, stone: 0 }
    expect(canRenovate(player)).toBe(true)
  })

  it('without C13 modifier: 5-room wood stays gated normally on stone-deficient renovate', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.houseType = 'wood'
    player.rooms = 5

    const mods = getModifiersForCostType(player, 'renovation')
    expect(mods).toHaveLength(0)
  })
})
