import { describe, expect, it } from 'vitest'
import { computeAllBuyableCombinations } from '../../actions/payment/internal/enumerate'
import { D88_Millwright } from '../D/D88_Millwright'
import type { CostModifier, PaymentSolution, PlayerState, Resource } from '../../contract/types'

const nonZeroPaid = (sol: PaymentSolution): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const [key, value] of Object.entries(sol.resourcesPaid)) {
    if ((value ?? 0) !== 0) out[key as keyof Resource] = value
  }
  return out
}

const sortedPayments = (solutions: PaymentSolution[]) =>
  solutions
    .map(nonZeroPaid)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))

const makePlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 99,
    clay: 99,
    reed: 99,
    stone: 99,
    food: 99,
    grain: 99,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  workers: [],
  rooms: 1,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [...(D88_Millwright.impl.modifiers ?? [])] as CostModifier[],
  cardStates: {},
  stats: {} as never,
})

describe('D88_Millwright', () => {
  it('uses two optional bonus choice sets per supported cost type', () => {
    const modifiers = D88_Millwright.impl.modifiers ?? []

    expect(modifiers).toHaveLength(8)
    expect(modifiers.every((modifier) => modifier.type === 'bonus')).toBe(true)
    for (const costType of ['construct', 'renovation', 'fencing', 'stables'] as const) {
      const scoped = modifiers.filter((modifier) => modifier.appliesTo.includes(costType))
      expect(scoped).toHaveLength(2)
      for (const modifier of scoped) {
        expect(modifier).toMatchObject({
          type: 'bonus',
          cardId: 'D88_Millwright',
          appliesTo: [costType],
          optional: true,
          trackChoiceIndex: false,
          choices: [
            { discount: { wood: 1, grain: -1 } },
            { discount: { clay: 1, grain: -1 } },
            { discount: { stone: 1, grain: -1 } },
            { discount: { reed: 1, grain: -1 } },
          ],
        })
      }
    }
  })

  it('construct replaces zero, one, or two building resources with one grain each', () => {
    const solutions = computeAllBuyableCombinations(
      makePlayer(),
      { unitFee: { wood: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )

    expect(sortedPayments(solutions)).toEqual(sortedPayments([
      { resourcesPaid: { wood: 3, reed: 2, grain: 2 }, tradesUsed: [], resourcesRemaining: {} },
      { resourcesPaid: { wood: 4, reed: 1, grain: 2 }, tradesUsed: [], resourcesRemaining: {} },
      { resourcesPaid: { wood: 4, reed: 2, grain: 1 }, tradesUsed: [], resourcesRemaining: {} },
      { resourcesPaid: { wood: 5, grain: 2 }, tradesUsed: [], resourcesRemaining: {} },
      { resourcesPaid: { wood: 5, reed: 1, grain: 1 }, tradesUsed: [], resourcesRemaining: {} },
      { resourcesPaid: { wood: 5, reed: 2 }, tradesUsed: [], resourcesRemaining: {} },
    ] as PaymentSolution[]))
  })
})
