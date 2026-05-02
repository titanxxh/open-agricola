import { describe, expect, it, beforeEach } from 'vitest'
import './setup-register-all'
import { CardRegistry } from '../registry'
import { setActiveCardRegistry, getActiveCardRegistry } from '../active-registry'
import { registerCustomCard } from '../custom-registry'
import type { CostModifier } from '../../game/types'
import type { CardDefinition } from '../types'

const baseCardJson = (id: string, extra?: Partial<CardDefinition>): CardDefinition => ({
  id,
  name: id,
  deck: 'custom',
  number: 9999,
  desc: ['custom test card'],
  ...extra,
})

describe('custom-registry modifier injection', () => {
  beforeEach(() => {
    setActiveCardRegistry(new CardRegistry())
  })

  it('injects card.modifier (singular) into active.modifiersByCard', () => {
    const modifier: CostModifier = {
      type: 'trade',
      cardId: 'CUSTOM_TestModifier',
      appliesTo: ['occupation'],
      from: { wood: 1 },
      to: { food: 1 },
    }
    registerCustomCard(
      {
        cardType: 'minor',
        cardJson: baseCardJson('CUSTOM_TestModifier', { modifier }),
      },
      { allowGlobal: true },
    )
    expect(getActiveCardRegistry()?.getModifiers('CUSTOM_TestModifier')).toHaveLength(1)
  })

  it('injects card.modifiers (plural) into active.modifiersByCard', () => {
    const mods: CostModifier[] = [
      {
        type: 'trade',
        cardId: 'CUSTOM_M2',
        appliesTo: ['plow'],
        from: { wood: 1 },
        to: { food: 1 },
      },
    ]
    registerCustomCard(
      {
        cardType: 'minor',
        cardJson: baseCardJson('CUSTOM_M2', { modifiers: mods }),
      },
      { allowGlobal: true },
    )
    expect(getActiveCardRegistry()?.getModifiers('CUSTOM_M2')).toHaveLength(1)
  })

  it('skips when neither modifier nor modifiers present', () => {
    registerCustomCard(
      {
        cardType: 'minor',
        cardJson: baseCardJson('CUSTOM_NoMod'),
      },
      { allowGlobal: true },
    )
    expect(getActiveCardRegistry()?.getModifiers('CUSTOM_NoMod') ?? []).toEqual([])
  })
})
