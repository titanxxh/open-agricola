import { describe, expect, it } from 'vitest'
import { E80_RockGarden } from '../../shared/cards-display/E/E80_RockGarden'
import { getMinorImprovementCard, isFieldCard, implementedMinorImprovementCards } from '../../shared/cards/catalog'

describe('E80_RockGarden (Sprint 7d isField stub)', () => {
  it('is registered as a field card via isField metadata', () => {
    expect(E80_RockGarden.isField).toBe(true)
    expect(isFieldCard('E80_RockGarden')).toBe(true)
  })

  it('is registered in catalog but excluded from dealt pool (implemented:false)', () => {
    const card = getMinorImprovementCard('E80_RockGarden')
    expect(card).toBeDefined()
    expect(card!.implemented).toBe(false)
    const dealtIds = implementedMinorImprovementCards.map((c) => c.id)
    expect(dealtIds).not.toContain('E80_RockGarden')
  })

  it('carries BGA cost-free metadata (no printed cost)', () => {
    expect(E80_RockGarden.cost).toBeUndefined()
    expect(E80_RockGarden.vp).toBeUndefined()
  })
})
