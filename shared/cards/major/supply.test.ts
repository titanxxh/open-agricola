import { describe, expect, it } from 'vitest'
import type { GameState, MajorSupplyStack } from '../../contract/types'
import {
  createMajorImprovementSupply,
  returnMajorImprovementToSupply,
  sixPlayerDuplicateMajorImprovementIds,
  takeMajorImprovementFromSupply,
} from './supply'

const farmersOfTheMoorMajorStackIds = [
  'Major_Fireplace1',
  'Major_Moor_HorseSlaughterhouse1',
  'Major_Fireplace2',
  'Major_Moor_HorseSlaughterhouse2',
  'Major_CookingHearth1',
  'Major_Moor_Cookhouse1',
  'Major_CookingHearth2',
  'Major_Moor_Cookhouse2',
  'Major_ClayOven',
  'Major_Moor_HeatingOven',
  'Major_StoneOven',
  'Major_Moor_TiledOven',
  'Major_Joinery',
  'Major_Moor_FurnitureStall',
  'Major_Pottery',
  'Major_Moor_CeramicsStall',
  'Major_Basket',
  'Major_Moor_BasketStall',
  'Major_Well',
  'Major_Moor_VillageChurch',
  'Major_Moor_PeatCharcoalKiln',
  'Major_Moor_MuseumOfTheMoors',
  'Major_Moor_ForestersLodge',
  'Major_Moor_RidingStables',
]

const createSixPlayerSupplyState = (): Pick<GameState, 'availableMajorImprovements' | 'majorImprovementSupply'> => {
  const majorImprovementSupply = createMajorImprovementSupply(6)!
  return {
    majorImprovementSupply,
    availableMajorImprovements: majorImprovementSupply
      .map((stack) => stack.visibleId)
      .filter((id): id is string => !!id),
  }
}

const readStack = (
  state: Pick<GameState, 'availableMajorImprovements' | 'majorImprovementSupply'>,
  familyId: string,
): MajorSupplyStack => {
  const stack = state.majorImprovementSupply?.find((candidate) => candidate.familyId === familyId)
  expect(stack).toBeDefined()
  return stack!
}

describe('major improvement supply helper', () => {
  it('creates the Farmers of the Moor twelve-stack major supply instead of six-player duplicates', () => {
    const supply = createMajorImprovementSupply(6, { enableFarmersOfTheMoor: true })!

    expect(supply).toHaveLength(12)
    expect(supply.flatMap((stack) => stack.cardIds).sort()).toEqual([...farmersOfTheMoorMajorStackIds].sort())
    expect(
      sixPlayerDuplicateMajorImprovementIds.every((id) =>
        !supply.flatMap((stack) => stack.cardIds).includes(id),
      ),
    ).toBe(true)
  })

  it.each([
    ['Major_Well', ['Major_Well']],
    ['Major_Well2', ['Major_Well2']],
  ])('returns %s to its emptied six-player family stack', (returnedCardId, expectedCardIds) => {
    const state = createSixPlayerSupplyState()

    takeMajorImprovementFromSupply(state, 'Major_Well')
    takeMajorImprovementFromSupply(state, 'Major_Well2')
    expect(readStack(state, 'well')).toMatchObject({ visibleId: null, cardIds: [] })
    expect(state.availableMajorImprovements).not.toContain('Major_Well')
    expect(state.availableMajorImprovements).not.toContain('Major_Well2')

    returnMajorImprovementToSupply(state, returnedCardId)

    expect(readStack(state, 'well')).toMatchObject({
      visibleId: returnedCardId,
      cardIds: expectedCardIds,
    })
    expect(state.availableMajorImprovements).toContain(returnedCardId)
  })
})
