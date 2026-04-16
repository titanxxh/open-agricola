import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game-session.ts'
import {
  clearCustomCards,
  getCustomMinorImprovement,
  getCustomMinorImprovementIds,
} from '../../shared/cards/custom-registry.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'

const makeCustomMinor = (id: string): CustomCardData => ({
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
  },
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
})
