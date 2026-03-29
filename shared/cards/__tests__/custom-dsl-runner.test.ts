import { describe, expect, it } from 'vitest'
import { dslToCardEffect, type CardDslEffects } from '../custom-dsl-runner'
import type { GameState, PlayerState } from '../../game/types'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  familySize: 2,
  resources: { wood: 3, clay: 2, reed: 1, stone: 0, food: 5, grain: 2, vegetable: 1 },
  improvements: [],
  minorPlayed: ['CUSTOM_TestCard'],
  occupationPlayed: [],
  workers: [],
  rooms: 2,
  stables: 0,
  fences: 0,
  farmyard: [],
  fields: [],
  handMinor: [],
  handOccupation: [],
  cardStates: {},
  beggingCards: 0,
  newborn: false,
  ...overrides,
} as unknown as PlayerState)

const makeState = (overrides: Partial<GameState> = {}): GameState => ({
  round: 5,
  players: [],
  ...overrides,
} as unknown as GameState)

describe('dslToCardEffect', () => {
  it('creates a card effect with a single hook', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        flow: [{ action: 'gain', params: { food: 2 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    expect(effect.id).toBe('CUSTOM_TestCard')
    expect(effect.onReturnHome).toBeDefined()
    expect(effect.onRoundStart).toBeUndefined()
  })

  it('creates a card effect with multiple hooks', () => {
    const dsl: CardDslEffects = {
      onReturnHome: { flow: [{ action: 'gain', params: { food: 1 } }] },
      onRoundStart: { flow: [{ action: 'gain', params: { wood: 1 } }] },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    expect(effect.onReturnHome).toBeDefined()
    expect(effect.onRoundStart).toBeDefined()
  })

  it('ignores unknown hooks', () => {
    const dsl = {
      onReturnHome: { flow: [{ action: 'gain', params: { food: 1 } }] },
      onUnknownHook: { flow: [{ action: 'gain', params: { food: 1 } }] },
    } as CardDslEffects
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    expect(effect.onReturnHome).toBeDefined()
    expect((effect as Record<string, unknown>)['onUnknownHook']).toBeUndefined()
  })
})

describe('handler behavior', () => {
  it('returns undefined when player does not own the card', () => {
    const dsl: CardDslEffects = {
      onReturnHome: { flow: [{ action: 'gain', params: { food: 2 } }] },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const player = makePlayer({ minorPlayed: [] }) // does not own card
    const result = effect.onReturnHome!(makeState(), player)
    expect(result).toBeUndefined()
  })

  it('returns a leaf for single-step flow', () => {
    const dsl: CardDslEffects = {
      onReturnHome: { flow: [{ action: 'gain', params: { food: 2 } }] },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer())
    expect(result).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 2 },
      sourceCard: 'CUSTOM_TestCard',
    })
  })

  it('returns a seq for multi-step flow', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        flow: [
          { action: 'pay-resources', params: { grain: 1 } },
          { action: 'gain', params: { food: 3 } },
        ],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer()) as { type: string; children: unknown[] }
    expect(result.type).toBe('seq')
    expect(result.children).toHaveLength(2)
  })

  it('propagates optional flag', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        optional: true,
        flow: [{ action: 'gain', params: { food: 2 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer()) as { optional: boolean }
    expect(result.optional).toBe(true)
  })

  it('defaults optional to false', () => {
    const dsl: CardDslEffects = {
      onReturnHome: { flow: [{ action: 'gain', params: { food: 2 } }] },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer()) as { optional: boolean }
    expect(result.optional).toBe(false)
  })
})

describe('conditions', () => {
  it('player_has_resource — passes when player has enough', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        condition: { player_has_resource: { wood: 2 } },
        flow: [{ action: 'gain', params: { food: 1 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer({ resources: { wood: 3 } } as Partial<PlayerState>))
    expect(result).toBeDefined()
  })

  it('player_has_resource — fails when player has not enough', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        condition: { player_has_resource: { wood: 10 } },
        flow: [{ action: 'gain', params: { food: 1 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer())
    expect(result).toBeUndefined()
  })

  it('round_gte — passes when round is high enough', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        condition: { round_gte: 3 },
        flow: [{ action: 'gain', params: { food: 1 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState({ round: 5 }), makePlayer())
    expect(result).toBeDefined()
  })

  it('round_gte — fails when round is too low', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        condition: { round_gte: 10 },
        flow: [{ action: 'gain', params: { food: 1 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState({ round: 5 }), makePlayer())
    expect(result).toBeUndefined()
  })

  it('family_size_gte — passes when family is large enough', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        condition: { family_size_gte: 2 },
        flow: [{ action: 'gain', params: { food: 1 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer({ familySize: 3 }))
    expect(result).toBeDefined()
  })

  it('family_size_gte — fails when family is too small', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        condition: { family_size_gte: 5 },
        flow: [{ action: 'gain', params: { food: 1 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer({ familySize: 2 }))
    expect(result).toBeUndefined()
  })

  it('player_has_card — passes when player has the card', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        condition: { player_has_card: 'CUSTOM_OtherCard' },
        flow: [{ action: 'gain', params: { food: 1 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer({ occupationPlayed: ['CUSTOM_OtherCard'] }))
    expect(result).toBeDefined()
  })

  it('player_has_card — fails when player lacks the card', () => {
    const dsl: CardDslEffects = {
      onReturnHome: {
        condition: { player_has_card: 'CUSTOM_MissingCard' },
        flow: [{ action: 'gain', params: { food: 1 } }],
      },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer())
    expect(result).toBeUndefined()
  })
})

describe('step validation', () => {
  it('throws on non-whitelisted action', () => {
    const dsl: CardDslEffects = {
      onReturnHome: { flow: [{ action: 'dangerous-action', params: {} }] },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    expect(() => effect.onReturnHome!(makeState(), makePlayer())).toThrow('not whitelisted')
  })

  it('sanitizes negative params to 0', () => {
    const dsl: CardDslEffects = {
      onReturnHome: { flow: [{ action: 'gain', params: { food: -5 } }] },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer()) as { params: Record<string, number> }
    expect(result.params.food).toBe(0)
  })

  it('floors float params', () => {
    const dsl: CardDslEffects = {
      onReturnHome: { flow: [{ action: 'gain', params: { food: 2.7 } }] },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer()) as { params: Record<string, number> }
    expect(result.params.food).toBe(2)
  })

  it('ignores non-finite params', () => {
    const dsl: CardDslEffects = {
      onReturnHome: { flow: [{ action: 'gain', params: { food: Infinity } }] },
    }
    const effect = dslToCardEffect('CUSTOM_TestCard', dsl)
    const result = effect.onReturnHome!(makeState(), makePlayer()) as { params: Record<string, number> }
    expect(result.params.food).toBeUndefined()
  })
})
