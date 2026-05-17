import { describe, it, expect } from 'vitest'
import { C8_PlantFertilizer_impl } from '../C/C8_PlantFertilizer'
import type { PlayerState, ActionFlow } from '../../contract/types'

const CARD_ID = 'C8_PlantFertilizer'

// C8 onBuy only reads {fields, minorPlayed, occupationPlayed, cardStates};
// remaining PlayerState fields are cast away intentionally.
const blankPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
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

const runOnBuy = (player: PlayerState): ActionFlow | undefined => {
  const fn = C8_PlantFertilizer_impl.effect?.onBuy
  if (!fn) throw new Error('C8 onBuy not defined')
  return fn({} as never, player, undefined) ?? undefined
}

describe('C8 PlantFertilizer onBuy — eligibility & shape', () => {
  it('returns undefined when no fields and D75/E80 not played', () => {
    const player = blankPlayer({ fields: [] })
    expect(runOnBuy(player)).toBeUndefined()
  })

  it('returns undefined when all fields empty', () => {
    const player = blankPlayer({
      fields: [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
      ],
    })
    expect(runOnBuy(player)).toBeUndefined()
  })

  it('returns undefined when a field has 2 goods', () => {
    const player = blankPlayer({
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }],
    })
    expect(runOnBuy(player)).toBeUndefined()
  })

  it('returns optional-SEQ with one field location for a single 1-grain field', () => {
    const player = blankPlayer({
      fields: [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }],
    })
    const flow = runOnBuy(player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.optional).toBe(true)
    expect(seq.children).toHaveLength(1)
    const leaf = seq.children![0]! as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('special-effect')
    expect(leaf.sourceCard).toBe(CARD_ID)
    expect(leaf.params).toEqual({
      kind: 'plant-additional-good',
      locations: [{ kind: 'field', row: 0, col: 1 }],
    })
  })

  it('returns optional-SEQ with one field location for a single 1-vegetable field', () => {
    const player = blankPlayer({
      fields: [{ row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] }],
    })
    const flow = runOnBuy(player)!
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children![0]! as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({
      kind: 'plant-additional-good',
      locations: [{ kind: 'field', row: 0, col: 2 }],
    })
  })

  it('includes D75 Wood Field when sum-of-remaining===1', () => {
    const player = blankPlayer({
      minorPlayed: ['D75_WoodField'],
      cardStates: {
        D75_WoodField: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] } },
      },
    })
    const flow = runOnBuy(player)!
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children![0]! as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({
      kind: 'plant-additional-good',
      locations: [{ kind: 'card-field', cardId: 'D75_WoodField' }],
    })
  })

  it('excludes D75 when sum-of-remaining===2', () => {
    const player = blankPlayer({
      minorPlayed: ['D75_WoodField'],
      cardStates: {
        D75_WoodField: {
          extraData: {
            cardFieldStacks: [
              { crop: 'wood', remaining: 1 },
              { crop: 'wood', remaining: 1 },
            ],
          },
        },
      },
    })
    expect(runOnBuy(player)).toBeUndefined()
  })

  it('excludes D75 when card is not in minorPlayed even if cardStates has stacks', () => {
    const player = blankPlayer({
      minorPlayed: [],
      cardStates: {
        D75_WoodField: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] } },
      },
    })
    expect(runOnBuy(player)).toBeUndefined()
  })

  it('includes E80 Rock Garden when sum-of-remaining===1', () => {
    const player = blankPlayer({
      minorPlayed: ['E80_RockGarden'],
      cardStates: {
        E80_RockGarden: { extraData: { cardFieldStacks: [{ crop: 'stone', remaining: 1 }] } },
      },
    })
    const flow = runOnBuy(player)!
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children![0]! as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({
      kind: 'plant-additional-good',
      locations: [{ kind: 'card-field', cardId: 'E80_RockGarden' }],
    })
  })

  it('includes single-slot field cards with exactly 1 remaining good', () => {
    const player = blankPlayer({
      minorPlayed: ['B68_Beanfield'],
      cardStates: {
        B68_Beanfield: {
          extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] },
        },
      },
    })
    const flow = runOnBuy(player)!
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children![0]! as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({
      kind: 'plant-additional-good',
      locations: [{ kind: 'card-field', cardId: 'B68_Beanfield' }],
    })
  })

  it('excludes single-slot field cards unless exactly 1 good remains', () => {
    const player = blankPlayer({
      minorPlayed: ['B68_Beanfield'],
      cardStates: {
        B68_Beanfield: {
          extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
        },
      },
    })
    expect(runOnBuy(player)).toBeUndefined()
  })

  it('includes occupation card-field holders (e.g. B113/B141) when sum-of-remaining===1', () => {
    const player = blankPlayer({
      occupationPlayed: ['B113_PlantBreeder'],
      cardStates: {
        B113_PlantBreeder: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
      },
    })
    const flow = runOnBuy(player)!
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children![0]! as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({
      kind: 'plant-additional-good',
      locations: [{ kind: 'card-field', cardId: 'B113_PlantBreeder' }],
    })
  })

  it('lists normal field BEFORE D75 in locations when both eligible', () => {
    const player = blankPlayer({
      fields: [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }],
      minorPlayed: ['D75_WoodField'],
      cardStates: {
        D75_WoodField: { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] } },
      },
    })
    const flow = runOnBuy(player)!
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    const leaf = seq.children![0]! as Extract<ActionFlow, { type: 'leaf' }>
    const locs = (leaf.params as { locations: unknown[] }).locations
    expect(locs).toEqual([
      { kind: 'field', row: 0, col: 1 },
      { kind: 'card-field', cardId: 'D75_WoodField' },
    ])
  })
})
