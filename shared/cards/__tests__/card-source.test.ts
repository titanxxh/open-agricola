import { describe, expect, expectTypeOf, it } from 'vitest'
import { CardRegistry } from '../registry'
import {
  defineMajorCard,
  defineMinorCard,
  defineOccupationCard,
  definePlayerActionCard,
  type CardSourceMetaInput,
} from '../card-source'
import type { CostModifier } from '../../contract/types'

describe('Card Source factories', () => {
  it('adds a stable kind and keeps runtime impl separate from meta', () => {
    const modifier: CostModifier = {
      type: 'trade',
      cardId: 'TEST_SourceMinor',
      appliesTo: ['occupation'],
      from: { wood: 1 },
      to: { food: 1 },
    }

    const source = defineMinorCard({
      meta: {
        id: 'TEST_SourceMinor',
        name: 'Source Minor',
        deck: 'TEST',
        number: 1,
        desc: ['A source minor.'],
        cost: { wood: 1 },
      },
      impl: {
        modifiers: [modifier],
        reaches: ['occupation'],
      },
    })

    expect(source.meta.kind).toBe('minor')
    expect(source.meta).not.toHaveProperty('modifiers')
    expect(source.impl?.modifiers).toEqual([modifier])
    expect(source.impl?.reaches).toEqual(['occupation'])

    const registry = new CardRegistry()
    registry.loadImpl(source.meta.id, source.impl!)
    expect(registry.getModifiers('TEST_SourceMinor')).toEqual([modifier])
  })

  it('supports occupation, player-action, and major card kinds', () => {
    expect(defineOccupationCard({
      meta: { id: 'TEST_SourceOccupation', name: 'Source Occupation', deck: 'TEST', number: 2, desc: [], players: '1+' },
    }).meta.kind).toBe('occupation')
    expect(definePlayerActionCard({
      meta: { id: 'TEST_SourceAction', name: 'Source Action', deck: 'TEST', number: 3, desc: [] },
    }).meta.kind).toBe('playerAction')
    expect(defineMajorCard({
      meta: { id: 'Major_SourceMajor', name: 'Source Major', deck: 'major', number: 4, desc: [], cost: { wood: 2 }, vp: 1 },
    }).meta.kind).toBe('major')
  })

  it('keeps runtime-only fields out of the meta type surface', () => {
    expectTypeOf<CardSourceMetaInput>().not.toHaveProperty('modifier')
    expectTypeOf<CardSourceMetaInput>().not.toHaveProperty('modifiers')
  })
})
