import { describe, expect, it } from 'vitest'
import type { GameState, MajorSupplyStack } from '../../contract/types'
import {
  createMajorImprovementSupply,
  filterAvailableMajorImprovementIds,
  getAvailableMajorImprovementIds,
  isMajorImprovementAvailable,
  moveMajorImprovementToSupplyTop,
  returnMajorImprovementToSupply,
  sixPlayerDuplicateMajorImprovementIds,
  swapMajorImprovementWithSupply,
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

const createFarmersOfTheMoorSupplyState = (): Pick<GameState, 'availableMajorImprovements' | 'majorImprovementSupply'> => {
  const majorImprovementSupply = createMajorImprovementSupply(2, { enableFarmersOfTheMoor: true })!
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
  it('queries visible major improvements through stack-aware supply', () => {
    const state = createFarmersOfTheMoorSupplyState()

    expect(getAvailableMajorImprovementIds(state)).toContain('Major_StoneOven')
    expect(isMajorImprovementAvailable(state, 'Major_StoneOven')).toBe(true)
    expect(isMajorImprovementAvailable(state, 'Major_Moor_TiledOven')).toBe(false)
    expect(filterAvailableMajorImprovementIds(state, ['Major_StoneOven', 'Major_Moor_TiledOven']))
      .toEqual(['Major_StoneOven'])

    moveMajorImprovementToSupplyTop(state, 'Major_Moor_TiledOven')

    expect(getAvailableMajorImprovementIds(state)).toContain('Major_Moor_TiledOven')
    expect(isMajorImprovementAvailable(state, 'Major_StoneOven')).toBe(false)
    expect(isMajorImprovementAvailable(state, 'Major_Moor_TiledOven')).toBe(true)
    expect(filterAvailableMajorImprovementIds(state, ['Major_StoneOven', 'Major_Moor_TiledOven']))
      .toEqual(['Major_Moor_TiledOven'])
  })

  it('queries flat compatibility supply when no stack supply exists', () => {
    const state = {
      availableMajorImprovements: ['Major_Well'],
      majorImprovementSupply: undefined,
    }

    expect(getAvailableMajorImprovementIds(state)).toEqual(['Major_Well'])
    expect(isMajorImprovementAvailable(state, 'Major_Well')).toBe(true)
    expect(isMajorImprovementAvailable(state, 'Major_Well2')).toBe(false)
    expect(filterAvailableMajorImprovementIds(state, ['Major_Well', 'Major_Well2']))
      .toEqual(['Major_Well'])
  })

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

  it('moves a hidden Farmers of the Moor major to the visible stack top', () => {
    const state = createFarmersOfTheMoorSupplyState()

    moveMajorImprovementToSupplyTop(state, 'Major_Moor_TiledOven')

    expect(readStack(state, 'stone-oven')).toMatchObject({
      visibleId: 'Major_Moor_TiledOven',
      cardIds: ['Major_Moor_TiledOven', 'Major_StoneOven'],
    })
    expect(state.availableMajorImprovements).toContain('Major_Moor_TiledOven')
    expect(state.availableMajorImprovements).not.toContain('Major_StoneOven')
  })

  it('keeps stack state correct after taking and swapping a moved-up major', () => {
    const state = createFarmersOfTheMoorSupplyState()
    moveMajorImprovementToSupplyTop(state, 'Major_Moor_TiledOven')

    takeMajorImprovementFromSupply(state, 'Major_Moor_TiledOven')
    expect(readStack(state, 'stone-oven')).toMatchObject({
      visibleId: 'Major_StoneOven',
      cardIds: ['Major_StoneOven'],
    })

    swapMajorImprovementWithSupply(state, 'Major_Moor_TiledOven', 'Major_StoneOven')

    expect(readStack(state, 'stone-oven')).toMatchObject({
      visibleId: 'Major_Moor_TiledOven',
      cardIds: ['Major_Moor_TiledOven'],
    })
    expect(state.availableMajorImprovements).toContain('Major_Moor_TiledOven')
    expect(state.availableMajorImprovements).not.toContain('Major_StoneOven')
  })
})
