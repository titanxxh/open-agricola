import { describe, expect, it } from 'vitest'
import type { GameState, MajorSupplyStack } from '../../contract/types'
import {
  createMajorImprovementSupply,
  returnMajorImprovementToSupply,
  takeMajorImprovementFromSupply,
} from './supply'

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
