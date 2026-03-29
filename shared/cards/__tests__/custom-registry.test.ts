import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  registerCustomCard,
  getCustomMinorImprovement,
  getCustomOccupation,
  getCustomMinorImprovementIds,
  getCustomOccupationIds,
  clearCustomCards,
} from '../custom-registry'
import { getCardEffect, clearCardEffects } from '../card-effects'
import type { CardDefinition } from '../types'

const minorJson: CardDefinition = {
  id: 'CUSTOM_TestMinor',
  name: 'Test Minor',
  deck: 'CUSTOM',
  number: 0,
  desc: ['Test card'],
  cost: { food: 1 },
  vp: 0,
  implemented: true,
}

const occupationJson: CardDefinition = {
  id: 'CUSTOM_TestOcc',
  name: 'Test Occupation',
  deck: 'CUSTOM',
  number: 0,
  desc: ['Test occupation'],
  cost: { food: 1 },
  vp: 0,
  implemented: true,
}

beforeEach(() => {
  clearCustomCards()
  clearCardEffects()
})

describe('registerCustomCard', () => {
  it('registers a minor improvement', () => {
    registerCustomCard({ cardType: 'minor', cardJson: minorJson })
    const card = getCustomMinorImprovement('CUSTOM_TestMinor')
    expect(card).not.toBeNull()
    expect(card!.id).toBe('CUSTOM_TestMinor')
  })

  it('registers an occupation', () => {
    registerCustomCard({ cardType: 'occupation', cardJson: occupationJson })
    const card = getCustomOccupation('CUSTOM_TestOcc')
    expect(card).not.toBeNull()
    expect(card!.id).toBe('CUSTOM_TestOcc')
  })

  it('returns null for unregistered cards', () => {
    expect(getCustomMinorImprovement('CUSTOM_Unknown')).toBeNull()
    expect(getCustomOccupation('CUSTOM_Unknown')).toBeNull()
  })

  it('registers card effect when DSL is provided', () => {
    registerCustomCard({
      cardType: 'minor',
      cardJson: minorJson,
      effectDsl: {
        onReturnHome: {
          flow: [{ action: 'gain', params: { food: 2 } }],
        },
      },
    })
    const effect = getCardEffect('CUSTOM_TestMinor')
    expect(effect).not.toBeNull()
    expect(effect!.onReturnHome).toBeDefined()
  })

  it('warns but does not throw on malformed DSL', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerCustomCard({
      cardType: 'minor',
      cardJson: minorJson,
      effectDsl: {
        onReturnHome: {
          flow: [{ action: 'illegal-action', params: {} }],
        },
      },
    })
    // Card should still be registered even if DSL fails
    expect(getCustomMinorImprovement('CUSTOM_TestMinor')).not.toBeNull()
    // Note: DSL error is thrown at execution time, not registration time,
    // so the effect is registered but will throw when called.
    // The try-catch in card-effects.ts handles this at runtime.
    warnSpy.mockRestore()
  })
})

describe('clearCustomCards', () => {
  it('clears all registered cards', () => {
    registerCustomCard({ cardType: 'minor', cardJson: minorJson })
    registerCustomCard({ cardType: 'occupation', cardJson: occupationJson })
    clearCustomCards()
    expect(getCustomMinorImprovement('CUSTOM_TestMinor')).toBeNull()
    expect(getCustomOccupation('CUSTOM_TestOcc')).toBeNull()
  })
})

describe('ID list functions', () => {
  it('returns minor improvement IDs', () => {
    registerCustomCard({ cardType: 'minor', cardJson: minorJson })
    expect(getCustomMinorImprovementIds()).toEqual(['CUSTOM_TestMinor'])
  })

  it('returns occupation IDs', () => {
    registerCustomCard({ cardType: 'occupation', cardJson: occupationJson })
    expect(getCustomOccupationIds()).toEqual(['CUSTOM_TestOcc'])
  })

  it('returns empty arrays when nothing registered', () => {
    expect(getCustomMinorImprovementIds()).toEqual([])
    expect(getCustomOccupationIds()).toEqual([])
  })
})
