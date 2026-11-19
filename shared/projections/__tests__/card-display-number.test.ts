import { describe, expect, it } from 'vitest'
import { officialCardDeck, officialCardDisplayNumber } from '../card-display-number'

describe('official card display numbers', () => {
  it('uses the printed deck number for ordinary deck cards', () => {
    expect(officialCardDisplayNumber('A004_Baseboards')).toBe('A004')
    expect(officialCardDisplayNumber('E081_AlchemistsLab')).toBe('E081')
    expect(officialCardDisplayNumber('M015_PeatBurnOff')).toBe('M015')
  })

  it('keeps the classic deck prefix, so a classic card never reads as the revised card of the same number', () => {
    expect(officialCardDisplayNumber('CE203_Shepherd')).toBe('CE203')
    expect(officialCardDisplayNumber('CI097_Slaughterhouse')).toBe('CI097')
    expect(officialCardDisplayNumber('CWM001_Example')).toBe('CWM001')
    expect(officialCardDisplayNumber('E203_Example')).toBe('E203')
    expect(officialCardDisplayNumber('C097_SeedResearcher')).toBe('C097')
  })

  it('numbers Farmers of the Moor major improvements in the M deck instead of by internal number', () => {
    expect(officialCardDisplayNumber('Major_Moor_HorseSlaughterhouse1')).toBe('M001')
    expect(officialCardDisplayNumber('Major_Moor_VillageChurch')).toBe('M005')
    expect(officialCardDisplayNumber('Major_Moor_PeatCharcoalKiln')).toBe('M011')
    expect(officialCardDisplayNumber('Major_Moor_RidingStables')).toBe('M014')
  })

  it('has no printed number for base major improvements, workshop cards or unknown ids', () => {
    expect(officialCardDisplayNumber('Major_Fireplace1')).toBeUndefined()
    expect(officialCardDisplayNumber('CUSTOM_FixtureHarvester')).toBeUndefined()
    expect(officialCardDisplayNumber('STUB_BeforeBakeGainClay')).toBeUndefined()
    expect(officialCardDisplayNumber('constructor')).toBeUndefined()
  })

  it('reports the deck badge shown on the card face', () => {
    expect(officialCardDeck('C057_Crudite')).toBe('C')
    expect(officialCardDeck('Major_Moor_CeramicsStall')).toBe('M')
    expect(officialCardDeck('Major_Well')).toBeUndefined()
    // Classic faces print the deck in their number and carry no revised deck badge.
    expect(officialCardDeck('CE203_Shepherd')).toBeUndefined()
  })
})
