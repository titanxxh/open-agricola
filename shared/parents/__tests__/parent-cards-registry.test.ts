import { describe, expect, it } from 'vitest'

import {
  FATHER_PARENT_CARD_IDS,
  MOTHER_PARENT_CARD_IDS,
  PARENT_CARD_IDS,
  fatherParentCards,
  getParentCardDefinition,
  isParentCardId,
  motherParentCards,
  parentCards,
} from '../index'

describe('Parent Card Definition registry scaffold', () => {
  it('declares the complete Parent Card id vocabulary before extraction lands', () => {
    expect(PARENT_CARD_IDS).toHaveLength(24)
    expect(MOTHER_PARENT_CARD_IDS).toEqual([
      'PR01', 'PR02', 'PR03', 'PR04', 'PR05', 'PR06',
      'PR07', 'PR08', 'PR09', 'PR10', 'PR11', 'PR12',
    ])
    expect(FATHER_PARENT_CARD_IDS).toEqual([
      'PS01', 'PS02', 'PS03', 'PS04', 'PS05', 'PS06',
      'PS07', 'PS08', 'PS09', 'PS10', 'PS11', 'PS12',
    ])
  })

  it('exposes extracted mother and father definitions through one registry', () => {
    expect(parentCards).toEqual([...motherParentCards, ...fatherParentCards])
    expect(parentCards.map((card) => card.id)).toEqual([
      ...MOTHER_PARENT_CARD_IDS,
      ...FATHER_PARENT_CARD_IDS,
    ])
    expect(getParentCardDefinition('PR01')?.kind).toBe('mother')
    expect(getParentCardDefinition('PS12')?.kind).toBe('father')
  })

  it('recognizes only stable Parent Card ids', () => {
    expect(isParentCardId('PR01')).toBe(true)
    expect(isParentCardId('PS12')).toBe(true)
    expect(isParentCardId('A092')).toBe(false)
    expect(isParentCardId('PR13')).toBe(false)
  })
})
