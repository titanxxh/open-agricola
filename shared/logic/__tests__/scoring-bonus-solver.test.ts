import { describe, it, expect } from 'vitest'
import { solveBonusScoring } from '../scoring-bonus-solver'
import { paretoOptimal } from '../../cards/helpers/pareto-bonus'
import type { GameState, PlayerState } from '../../game/types'
import type { BonusScoringContext } from '../../cards/card-effects'

const makePlayer = (resources: Partial<PlayerState['resources']> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  resources: {
    food: 0, wood: 0, clay: 0, stone: 0, reed: 0,
    grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, begging: 0,
    ...resources,
  },
} as PlayerState)

const makeState = (): GameState => ({ players: [], round: 14 } as GameState)
const ctx: BonusScoringContext = { categories: [] }

describe('solveBonusScoring', () => {
  it('returns 0 score for empty input', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer(),
      ctx,
      freeHandlers: [],
      costedHandlers: [],
    })
    expect(result.totalScore).toBe(0)
    expect(result.totalCost).toEqual({})
    expect(result.entries).toEqual([])
  })

  it('sums pure free bonus scores', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer(),
      ctx,
      freeHandlers: [
        { cardId: 'A38', handler: () => 3 },
        { cardId: 'A101', handler: () => 2 },
      ],
      costedHandlers: [],
    })
    expect(result.totalScore).toBe(5)
    expect(result.entries).toEqual([
      { cardId: 'A38', score: 3, cost: {} },
      { cardId: 'A101', score: 2, cost: {} },
    ])
  })

  it('picks max costed level for single card with full resources', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer({ wood: 3, clay: 3, stone: 3, reed: 3 }),
      ctx,
      freeHandlers: [],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, clay: 1, stone: 1, reed: 1 }, score: 1 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
            { cost: { wood: 3, clay: 3, stone: 3, reed: 3 }, score: 5 },
          ],
        },
      ],
    })
    expect(result.totalScore).toBe(5)
    expect(result.totalCost).toEqual({ wood: 3, clay: 3, stone: 3, reed: 3 })
  })

  it('picks lower level when resources insufficient', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer({ wood: 1, clay: 1, stone: 1, reed: 1 }),
      ctx,
      freeHandlers: [],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, clay: 1, stone: 1, reed: 1 }, score: 1 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
          ],
        },
      ],
    })
    expect(result.totalScore).toBe(1)
    expect(result.totalCost).toEqual({ wood: 1, clay: 1, stone: 1, reed: 1 })
  })

  it('coordinates two costed cards competing for shared resource', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer({ wood: 2, clay: 2, stone: 2, reed: 2 }),
      ctx,
      freeHandlers: [],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, clay: 1, stone: 1, reed: 1 }, score: 1 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
          ],
        },
        {
          cardId: 'C133',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, stone: 1 }, score: 1 },
            { cost: { wood: 2, stone: 2 }, score: 2 },
          ],
        },
      ],
    })
    expect(result.totalScore).toBe(3)
    expect(result.totalCost).toEqual({ wood: 2, clay: 2, stone: 2, reed: 2 })
  })

  it('lets free card see remaining resources after costed commit (D60 pattern)', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer({ wood: 4, clay: 4, stone: 4, reed: 4 }),
      ctx,
      freeHandlers: [
        {
          cardId: 'D60',
          handler: (_s, p) => {
            const c = p.resources.clay
            if (c >= 7) return 4
            if (c >= 6) return 3
            if (c >= 5) return 2
            if (c >= 3) return 1
            return 0
          },
        },
      ],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 1, clay: 1, stone: 1, reed: 1 }, score: 1 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
            { cost: { wood: 3, clay: 3, stone: 3, reed: 3 }, score: 5 },
          ],
        },
      ],
    })
    // A136=3 sets cost 3W3C3S3R (clay=4-3=1) → +5 VP, D60 sees clay=1 → 0; total 5
    expect(result.totalScore).toBe(5)
  })

  it('mutates player.resources on commit', () => {
    const player = makePlayer({ wood: 3, clay: 3, stone: 3, reed: 3 })
    solveBonusScoring({
      state: makeState(),
      player,
      ctx,
      freeHandlers: [],
      costedHandlers: [
        {
          cardId: 'A136',
          handler: () => [
            { cost: {}, score: 0 },
            { cost: { wood: 2, clay: 2, stone: 2, reed: 2 }, score: 3 },
          ],
        },
      ],
    })
    expect(player.resources.wood).toBe(1)
    expect(player.resources.clay).toBe(1)
    expect(player.resources.stone).toBe(1)
    expect(player.resources.reed).toBe(1)
  })

  it('falls back to no-op when costed handler returns empty levels', () => {
    const result = solveBonusScoring({
      state: makeState(),
      player: makePlayer({ wood: 5 }),
      ctx,
      freeHandlers: [],
      costedHandlers: [
        { cardId: 'BadCard', handler: () => [] },
      ],
    })
    expect(result.totalScore).toBe(0)
    expect(result.totalCost).toEqual({})
    expect(result.entries).toEqual([{ cardId: 'BadCard', score: 0, cost: {} }])
  })
})

describe('paretoOptimal', () => {
  it('keeps max-score level per cost vector', () => {
    const result = paretoOptimal([
      { cost: { food: 1 }, score: 1 },
      { cost: { food: 1 }, score: 2 },
      { cost: { food: 4 }, score: 2 },
      { cost: { food: 4 }, score: 1 },
    ])
    expect(result).toHaveLength(2)
    expect(result.find(l => l.cost.food === 1)?.score).toBe(2)
    expect(result.find(l => l.cost.food === 4)?.score).toBe(2)
  })
})
