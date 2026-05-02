import { describe, expect, it } from 'vitest'
import { D75_WoodField } from '../../shared/cards/D/D75_WoodField'
import { getMinorImprovementCard, isFieldCard, implementedMinorImprovementCards } from '../../shared/cards/catalog'

describe('D75_WoodField (Sprint 7d isField stub)', () => {
  it('is registered as a field card via isField metadata', () => {
    expect(D75_WoodField.isField).toBe(true)
    expect(isFieldCard('D75_WoodField')).toBe(true)
  })

  it('is registered in catalog but excluded from dealt pool (implemented:false)', () => {
    const card = getMinorImprovementCard('D75_WoodField')
    expect(card).toBeDefined()
    expect(card!.implemented).toBe(false)
    const dealtIds = implementedMinorImprovementCards.map((c) => c.id)
    expect(dealtIds).not.toContain('D75_WoodField')
  })

  it('carries BGA cost / vp / prerequisite metadata', () => {
    expect(D75_WoodField.cost).toEqual({ food: 1 })
    expect(D75_WoodField.vp).toBe(1)
    expect(D75_WoodField.prerequisite).toBe('1 Occupation')
    expect(D75_WoodField.occupationPrerequisites).toEqual({ min: 1 })
  })
})
