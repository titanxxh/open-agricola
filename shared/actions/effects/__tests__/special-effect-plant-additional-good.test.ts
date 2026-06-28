import { describe, it, expect } from 'vitest'
import { specialEffectAction } from '../special-effect'
import { readCardExtraData } from '../../../cards/helpers/card-state'
import type { GameState, PlayerState, ActionSpace } from '../../../contract/types'

// C8 onBuy / special-effect only reads {fields, minorPlayed, cardStates};
// remaining PlayerState fields are cast away intentionally.
const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  },
  fields: [],
  minorPlayed: [],
  occupationPlayed: [],
  improvements: [],
  pastures: [],
  cardStates: {},
  ...overrides,
} as unknown as PlayerState)

const exec = (player: PlayerState, params: unknown) =>
  specialEffectAction.execute!({
    state: undefined as unknown as GameState,
    player,
    sourceCard: 'C008_PlantFertilizer',
    params: params as Record<string, unknown>,
    // `space` is unused inside specialEffectAction.execute; cast is intentional.
    space: undefined as unknown as ActionSpace,
  })

describe('special-effect: plant-additional-good — field location', () => {
  it('grows the lone stack on a normal field by 1', () => {
    const player = makePlayer({
      fields: [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }],
    })
    const result = exec(player, {
      kind: 'plant-additional-good',
      locations: [{ kind: 'field', row: 0, col: 1 }],
    })
    expect(result.type).toBe('ok')
    expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
  })
})

describe('special-effect: plant-additional-good — card-field location (D75 multi-stack)', () => {
  it('grows the lone stack stored under cardStates extraData.cardFieldStacks by 1', () => {
    const player = makePlayer({
      cardStates: {
        D075_WoodField: {
          extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] },
        },
      },
    })
    const result = exec(player, {
      kind: 'plant-additional-good',
      locations: [{ kind: 'card-field', cardId: 'D075_WoodField' }],
    })
    expect(result.type).toBe('ok')
    expect(readCardExtraData(player, 'D075_WoodField', 'cardFieldStacks'))
      .toEqual([{ crop: 'wood', remaining: 2 }])
  })
})

describe('special-effect: plant-additional-good — card-field location (B68 single-slot)', () => {
  it('grows the single-slot stack stored under cardStates extraData.cardFieldStacks by 1', () => {
    const player = makePlayer({
      cardStates: {
        B068_Beanfield: {
          extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] },
        },
      },
    })
    const result = exec(player, {
      kind: 'plant-additional-good',
      locations: [{ kind: 'card-field', cardId: 'B068_Beanfield' }],
    })
    expect(result.type).toBe('ok')
    expect(readCardExtraData(player, 'B068_Beanfield', 'cardFieldStacks'))
      .toEqual([{ crop: 'vegetable', remaining: 2 }])
  })
})

describe('special-effect: plant-additional-good — invariant violations', () => {
  it('throws when target field is missing', () => {
    const player = makePlayer({ fields: [] })
    expect(() =>
      exec(player, {
        kind: 'plant-additional-good',
        locations: [{ kind: 'field', row: 0, col: 1 }],
      }),
    ).toThrow(/missing field/)
  })

  it('throws when field has no stack with remaining>=1', () => {
    const player = makePlayer({
      fields: [{ row: 0, col: 1, stacks: [] }],
    })
    expect(() =>
      exec(player, {
        kind: 'plant-additional-good',
        locations: [{ kind: 'field', row: 0, col: 1 }],
      }),
    ).toThrow(/no stack with remaining/)
  })

  it('throws when card stacks empty', () => {
    const player = makePlayer({
      cardStates: { D075_WoodField: { extraData: { cardFieldStacks: [] } } },
    })
    expect(() =>
      exec(player, {
        kind: 'plant-additional-good',
        locations: [{ kind: 'card-field', cardId: 'D075_WoodField' }],
      }),
    ).toThrow(/no stack with remaining.*D075_WoodField/)
  })

  it('does not mutate earlier locations when a later location is invalid', () => {
    const player = makePlayer({
      fields: [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }],
    })
    expect(() =>
      exec(player, {
        kind: 'plant-additional-good',
        locations: [
          { kind: 'field', row: 0, col: 1 },
          { kind: 'field', row: 9, col: 9 },
        ],
      }),
    ).toThrow(/missing field/)
    expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
  })
})
