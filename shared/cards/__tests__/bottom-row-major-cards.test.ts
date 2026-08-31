import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../session/state-bootstrap'
import { B007_Wage_impl } from '../B/B007_Wage'
import { D030_ArtisanDistrict_impl } from '../D/D030_ArtisanDistrict'

const bottomRowMajors = [
  'Major_ClayOven',
  'Major_StoneOven',
  'Major_Joinery',
  'Major_Pottery',
  'Major_Basket',
  'Major_ClayOven2',
  'Major_StoneOven2',
  'Major_Joinery2',
  'Major_Pottery2',
  'Major_Basket2',
  'Major_Moor_HeatingOven',
  'Major_Moor_TiledOven',
  'Major_Moor_FurnitureStall',
  'Major_Moor_CeramicsStall',
  'Major_Moor_BasketStall',
] as const

const nonBottomRowMajors = [
  'Major_Fireplace1',
  'Major_Well',
  'Major_Well2',
  'Major_Moor_VillageChurch',
  'D060_LargePottery',
] as const

const setup = () => {
  const state = createInitialState(42, { playerCount: 2 })
  return { state, player: state.players[0]! }
}

describe('bottom-row major improvement card rules', () => {
  it.each(bottomRowMajors)('B007 counts %s', (cardId) => {
    const { state, player } = setup()
    player.improvements = [cardId]

    expect(B007_Wage_impl.effect.onBuy(state, player)).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 3 },
      sourceCard: 'B007_Wage',
    })
  })

  it.each(nonBottomRowMajors)('B007 does not count %s', (cardId) => {
    const { state, player } = setup()
    player.improvements = [cardId]

    expect(B007_Wage_impl.effect.onBuy(state, player)).toMatchObject({
      params: { food: 2 },
    })
  })

  it.each([
    [['Major_ClayOven', 'Major_StoneOven', 'Major_Joinery'], 2],
    [['Major_ClayOven2', 'Major_StoneOven2', 'Major_Joinery2', 'Major_Pottery2'], 5],
    [[
      'Major_Moor_HeatingOven',
      'Major_Moor_TiledOven',
      'Major_Moor_FurnitureStall',
      'Major_Moor_CeramicsStall',
      'Major_Moor_BasketStall',
    ], 8],
    [[
      'Major_ClayOven',
      'Major_StoneOven',
      'Major_Well',
      'Major_Moor_VillageChurch',
      'D060_LargePottery',
    ], 0],
  ] as const)('D030 scores bottom-row variants in %j as %i VP', (improvements, expected) => {
    const { state, player } = setup()
    player.improvements = [...improvements]

    expect(D030_ArtisanDistrict_impl.effect.computeBonusScore(state, player)).toBe(expected)
  })
})
