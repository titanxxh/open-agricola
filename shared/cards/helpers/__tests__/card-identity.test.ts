import { describe, expect, it } from 'vitest'
import { isEffectivelyMajor } from '../card-identity'

// Force card registrations
import '../../A/A60_OrientalFireplace'
import '../../D/D59_EarthOven'
import '../../C/C60_SmallPottersOven'
import '../../D/D25_WitchesDanceFloor'
import '../../E/E63_IronOven'
import '../../E/E64_SimpleOven'
import '../../A/A55_JunkRoom'

describe('isEffectivelyMajor', () => {
  it('Major_Fireplace1 → true', () => {
    expect(isEffectivelyMajor('Major_Fireplace1')).toBe(true)
  })

  it('Major_CookingHearth1 → true', () => {
    expect(isEffectivelyMajor('Major_CookingHearth1')).toBe(true)
  })

  it('A60 OrientalFireplace → true (isMajorImprovement)', () => {
    expect(isEffectivelyMajor('A60_OrientalFireplace')).toBe(true)
  })

  it('D59 EarthOven → true (isMajorImprovement)', () => {
    expect(isEffectivelyMajor('D59_EarthOven')).toBe(true)
  })

  it('C60 SmallPottersOven → true (isMajorImprovement)', () => {
    expect(isEffectivelyMajor('C60_SmallPottersOven')).toBe(true)
  })

  it('D25 WitchesDanceFloor → true (isMajorImprovement)', () => {
    expect(isEffectivelyMajor('D25_WitchesDanceFloor')).toBe(true)
  })

  it('E63 IronOven → false (pure minor)', () => {
    expect(isEffectivelyMajor('E63_IronOven')).toBe(false)
  })

  it('E64 SimpleOven → false (pure minor)', () => {
    expect(isEffectivelyMajor('E64_SimpleOven')).toBe(false)
  })

  it('A55 JunkRoom → false (regular minor)', () => {
    expect(isEffectivelyMajor('A55_JunkRoom')).toBe(false)
  })

  it('nonexistent card → false', () => {
    expect(isEffectivelyMajor('FAKE_Card_999')).toBe(false)
  })
})
