import { describe, expect, it } from 'vitest'
import './setup-register-all'
import { CardRegistry } from '../registry'
import { allOccupationCards, allMinorImprovementCards } from '../catalog'

describe('CardRegistry.syncModifiersFromCatalog', () => {
  it('writes minor.modifier (singular) into modifiersByCard', () => {
    const registry = new CardRegistry()
    registry.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)
    const mods = registry.getModifiers('A28_ForestSchool')
    expect(mods).toHaveLength(1)
    expect(mods[0]?.type).toBe('trade')
  })

  it('writes minor.modifiers (plural array) into modifiersByCard', () => {
    const registry = new CardRegistry()
    registry.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)
    const mods = registry.getModifiers('A123_FrameBuilder')
    expect(mods.length).toBeGreaterThan(0)
  })

  it('skips cards with no modifier and no modifiers field', () => {
    const registry = new CardRegistry()
    registry.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)
    expect(registry.getModifiers('A1_Shelter')).toEqual([])
  })

  it('does not include majors (caller does not pass majors anyway)', () => {
    const registry = new CardRegistry()
    registry.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)
    expect(registry.getModifiers('Major_Fireplace1')).toEqual([])
  })
})
