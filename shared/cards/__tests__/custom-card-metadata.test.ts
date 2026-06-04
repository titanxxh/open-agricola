import { beforeEach, describe, expect, it } from 'vitest'
import type { CostModifier } from '../../contract/types'
import {
  clearCustomCardMetadata,
  getCustomCardArtUrl,
  getCustomCardMetadata,
  getCustomCardNumbering,
  registerCustomCardMetadata,
} from '../custom-card-metadata'

const modifier: CostModifier = {
  type: 'trade',
  cardId: 'CUSTOM_MetaMinor',
  appliesTo: ['occupation'],
  from: { wood: 1 },
  to: { food: 1 },
}

beforeEach(() => {
  clearCustomCardMetadata()
})

describe('custom-card metadata registry', () => {
  it('stores display metadata, art lookup, and O-series numbering without runtime modifiers', () => {
    registerCustomCardMetadata({
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_MetaMinor',
        name: 'Meta Minor',
        deck: 'CUSTOM',
        number: 0,
        desc: ['Display only.'],
        cost: { wood: 1 },
        vp: 1,
        modifier,
        modifiers: [modifier],
      },
      artUrl: '/card-art/custom/meta-minor.webp',
    })
    registerCustomCardMetadata({
      cardType: 'occupation',
      cardJson: {
        id: 'CUSTOM_MetaOccupation',
        name: 'Meta Occupation',
        deck: 'CUSTOM',
        number: 0,
        desc: ['Display only.'],
      },
    })

    const minor = getCustomCardMetadata('CUSTOM_MetaMinor')
    const minorJson = minor?.cardJson as Record<string, unknown> | undefined

    expect(minor?.cardType).toBe('minor')
    expect(minor?.cardJson.name).toBe('Meta Minor')
    expect(minorJson?.modifier).toBeUndefined()
    expect(minorJson?.modifiers).toBeUndefined()
    expect(getCustomCardArtUrl('CUSTOM_MetaMinor')).toBe('/card-art/custom/meta-minor.webp')
    expect(getCustomCardNumbering('CUSTOM_MetaMinor')).toBe('O001')
    expect(getCustomCardNumbering('CUSTOM_MetaOccupation')).toBe('O500')
  })
})
