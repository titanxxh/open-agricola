import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  registerCustomCard,
  getCustomMinorImprovement,
  getCustomOccupation,
  getCustomMinorImprovementIds,
  getCustomOccupationIds,
  clearCustomCards,
} from '../custom-registry'
import type { CardDefinition } from '../../contract/cards'
import type { CustomCardData } from '../session-card-context'
import { CardRegistry } from '../registry'
import { setActiveCardRegistry } from '../active-registry'

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
  setActiveCardRegistry(new CardRegistry())
})

const registerCustomCardWithOptions = registerCustomCard as unknown as (
  data: CustomCardData,
  options?: { allowGlobal?: boolean },
) => void

const registerLegacyGlobalCard = (data: CustomCardData) =>
  registerCustomCardWithOptions(data, { allowGlobal: true })

describe('registerCustomCard', () => {
  it('registers a minor improvement', () => {
    registerLegacyGlobalCard({ cardType: 'minor', cardJson: minorJson })
    const card = getCustomMinorImprovement('CUSTOM_TestMinor')
    expect(card).not.toBeNull()
    expect(card!.id).toBe('CUSTOM_TestMinor')
  })

  it('registers an occupation', () => {
    registerLegacyGlobalCard({ cardType: 'occupation', cardJson: occupationJson })
    const card = getCustomOccupation('CUSTOM_TestOcc')
    expect(card).not.toBeNull()
    expect(card!.id).toBe('CUSTOM_TestOcc')
  })

  it('returns null for unregistered cards', () => {
    expect(getCustomMinorImprovement('CUSTOM_Unknown')).toBeNull()
    expect(getCustomOccupation('CUSTOM_Unknown')).toBeNull()
  })

  it('warns when global fallback is used without explicit allowGlobal', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    registerCustomCard({ cardType: 'minor', cardJson: minorJson })

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('CUSTOM_TestMinor'),
    )
    warnSpy.mockRestore()
  })
})

describe('clearCustomCards', () => {
  it('clears all registered cards', () => {
    registerLegacyGlobalCard({ cardType: 'minor', cardJson: minorJson })
    registerLegacyGlobalCard({ cardType: 'occupation', cardJson: occupationJson })
    clearCustomCards()
    expect(getCustomMinorImprovement('CUSTOM_TestMinor')).toBeNull()
    expect(getCustomOccupation('CUSTOM_TestOcc')).toBeNull()
  })
})

describe('ID list functions', () => {
  it('returns minor improvement IDs', () => {
    registerLegacyGlobalCard({ cardType: 'minor', cardJson: minorJson })
    expect(getCustomMinorImprovementIds()).toEqual(['CUSTOM_TestMinor'])
  })

  it('returns occupation IDs', () => {
    registerLegacyGlobalCard({ cardType: 'occupation', cardJson: occupationJson })
    expect(getCustomOccupationIds()).toEqual(['CUSTOM_TestOcc'])
  })

  it('returns empty arrays when nothing registered', () => {
    expect(getCustomMinorImprovementIds()).toEqual([])
    expect(getCustomOccupationIds()).toEqual([])
  })
})
