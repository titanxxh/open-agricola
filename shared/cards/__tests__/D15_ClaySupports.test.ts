import { describe, expect, it } from 'vitest'
import { computeAllBuyableCombinations } from '../../actions/payment/internal/enumerate'
import { D15_ClaySupports } from '../../cards-display/D/D15_ClaySupports'
import type { CostModifier, PlayerState } from '../../contract/types'

// D15_ClaySupports unit test — wired through the static `modifier` field on
// the cards-display definition. The static field is mirrored into
// `player.activeModifiers` via `rebuildActiveModifiers` during loadState in
// session paths; here we inject the modifier directly to keep the unit test
// fast and independent of GameSession setup.

const makePlayer = (
  houseType: PlayerState['houseType'] = 'clay',
  resources: Partial<PlayerState['resources']> = {},
): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 99,
    clay: 99,
    reed: 99,
    stone: 99,
    food: 99,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
    ...resources,
  },
  workers: [],
  rooms: 1,
  houseType,
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
  activeModifiers: D15_ClaySupports.modifier
    ? [D15_ClaySupports.modifier as CostModifier]
    : [],
  cardStates: {},
  stats: {} as any,
})

describe('D15_ClaySupports unit-scope trade migration', () => {
  it('static modifier shape: scope:unit, houseTypeClay condition', () => {
    expect(D15_ClaySupports.modifier).toBeDefined()
    expect(D15_ClaySupports.modifier).toMatchObject({
      type: 'trade',
      cardId: 'D15_ClaySupports',
      appliesTo: ['construct'],
      scope: 'unit',
      from: { wood: 1 },
      to: { clay: 3, reed: 1 },
      conditions: { houseTypeClay: 1 },
    })
  })

  it('clay-house nb=2: scope:unit budget allows k∈{0,1,2} per-room swaps', () => {
    const sols = computeAllBuyableCombinations(
      makePlayer('clay'),
      { unitFee: { clay: 5, reed: 2 }, nb: 2 },
      undefined,
      'construct',
    )
    const swapCounts = new Set(
      sols.map((s) => s.tradesUsed.reduce((acc, t) => acc + t.times, 0)),
    )
    // Σ-times ≤ nb=2 → swap counts in {0,1,2}.
    expect(swapCounts).toEqual(new Set([0, 1, 2]))
  })

  it('clay-house nb=1: swap counts in {0,1} (single room)', () => {
    const sols = computeAllBuyableCombinations(
      makePlayer('clay'),
      { unitFee: { clay: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )
    const swapCounts = new Set(
      sols.map((s) => s.tradesUsed.reduce((acc, t) => acc + t.times, 0)),
    )
    expect(swapCounts).toEqual(new Set([0, 1]))
    // The k=1 solution embeds D15: pays clay:2 + reed:1 + wood:1 instead of clay:5+reed:2.
    const swapped = sols.find((s) =>
      s.tradesUsed.some((t) => t.times === 1 && t.trade.from.wood === 1),
    )
    expect(swapped).toBeDefined()
    expect(swapped!.resourcesPaid.clay).toBe(2)
    expect(swapped!.resourcesPaid.reed).toBe(1)
    expect(swapped!.resourcesPaid.wood).toBe(1)
  })

  it('wood-house: D15 trade filtered out by houseTypeClay condition', () => {
    const sols = computeAllBuyableCombinations(
      makePlayer('wood'),
      { unitFee: { wood: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )
    expect(sols.length).toBeGreaterThan(0)
    sols.forEach((s) => {
      const total = s.tradesUsed.reduce((acc, t) => acc + t.times, 0)
      expect(total).toBe(0)
      // Pure wood-house base cost only — no clay component.
      expect(s.resourcesPaid.clay ?? 0).toBe(0)
    })
  })

  it('stone-house: D15 trade filtered out', () => {
    const sols = computeAllBuyableCombinations(
      makePlayer('stone'),
      { unitFee: { stone: 5, reed: 2 }, nb: 1 },
      undefined,
      'construct',
    )
    expect(sols.length).toBeGreaterThan(0)
    sols.forEach((s) => {
      const total = s.tradesUsed.reduce((acc, t) => acc + t.times, 0)
      expect(total).toBe(0)
      expect(s.resourcesPaid.clay ?? 0).toBe(0)
    })
  })
})
