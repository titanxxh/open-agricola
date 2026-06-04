import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session.ts'
import { getCardModifiers } from '../../shared/cards/card-modifiers.ts'
import {
  clearCustomCards,
  getCustomMinorImprovement,
  getCustomMinorImprovementIds,
} from '../../shared/cards/custom-registry.ts'
import type { CostModifier } from '../../shared/contract/types.ts'
import type { CardDefinition } from '../../shared/contract/cards.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'

const makeCustomMinor = (id: string, extra?: Partial<CardDefinition>): CustomCardData => ({
  cardType: 'minor',
  cardJson: {
    id,
    name: id,
    deck: 'CUSTOM',
    number: 0,
    desc: ['session scoped'],
    cost: { food: 1 },
    vp: 0,
    implemented: true,
    ...extra,
  },
})

const makeModifier = (id: string): CostModifier => ({
  type: 'trade',
  cardId: id,
  appliesTo: ['occupation'],
  from: { wood: 1 },
  to: { food: 1 },
})

afterEach(() => {
  clearCustomCards()
})

describe('GameSession custom card context isolation', () => {
  it('keeps session-scoped custom cards isolated across parallel sessions', () => {
    const cardA = makeCustomMinor('CUSTOM_SessionA')
    const cardB = makeCustomMinor('CUSTOM_SessionB')

    const sessionA = new GameSession(undefined, [cardA])
    const sessionB = new GameSession(undefined, [cardB])

    expect(getCustomMinorImprovement('CUSTOM_SessionA')).toBeNull()
    expect(getCustomMinorImprovement('CUSTOM_SessionB')).toBeNull()

    expect(sessionA.withCtx(() => getCustomMinorImprovementIds())).toEqual(['CUSTOM_SessionA'])
    expect(sessionB.withCtx(() => getCustomMinorImprovementIds())).toEqual(['CUSTOM_SessionB'])
    expect(sessionA.withCtx(() => getCustomMinorImprovement('CUSTOM_SessionA')?.id)).toBe('CUSTOM_SessionA')
    expect(sessionA.withCtx(() => getCustomMinorImprovement('CUSTOM_SessionB'))).toBeNull()
    expect(sessionB.withCtx(() => getCustomMinorImprovement('CUSTOM_SessionB')?.id)).toBe('CUSTOM_SessionB')
    expect(sessionB.withCtx(() => getCustomMinorImprovement('CUSTOM_SessionA'))).toBeNull()

    expect(sessionA.getCustomCardDefs().map((def) => def.cardJson.id)).toEqual(['CUSTOM_SessionA'])
    expect(sessionB.getCustomCardDefs().map((def) => def.cardJson.id)).toEqual(['CUSTOM_SessionB'])

    sessionA.dispose()
    sessionB.dispose()
  })

  it('keeps custom modifier runtime isolated across parallel sessions', () => {
    const cardA = makeCustomMinor('CUSTOM_ModifierA', { modifiers: [makeModifier('CUSTOM_ModifierA')] })
    const cardB = makeCustomMinor('CUSTOM_ModifierB', { modifiers: [makeModifier('CUSTOM_ModifierB')] })

    const sessionA = new GameSession(undefined, [cardA])
    const sessionB = new GameSession(undefined, [cardB])

    expect(sessionA.withCtx(() => getCardModifiers('CUSTOM_ModifierA'))).toHaveLength(1)
    expect(sessionA.withCtx(() => getCardModifiers('CUSTOM_ModifierB'))).toHaveLength(0)
    expect(sessionB.withCtx(() => getCardModifiers('CUSTOM_ModifierB'))).toHaveLength(1)
    expect(sessionB.withCtx(() => getCardModifiers('CUSTOM_ModifierA'))).toHaveLength(0)

    sessionA.dispose()
    sessionB.dispose()
  })
})
