/**
 * Permutation-invariance probe harness for cost modifier ordering (#288).
 *
 * Target semantics (ADR 0004 Candidate Closure): the set of payment
 * candidates must not depend on the order in which cost modifiers are
 * registered or applied. This harness enumerates permutations of a modifier
 * collection and compares the normalized candidate sets produced by each
 * permutation through the production entry points.
 */
import type {
  CardCostCandidate,
  ComplexCost,
  GameState,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
} from '../../../../contract/types'

export const permutations = <T>(items: readonly T[]): T[][] => {
  if (items.length <= 1) return [[...items]]
  const out: T[][] = []
  items.forEach((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)]
    for (const tail of permutations(rest)) {
      out.push([item, ...tail])
    }
  })
  return out
}

const resourceKey = (resources: PaymentResourceMap): string =>
  JSON.stringify(
    Object.entries(resources)
      .filter(([, amount]) => typeof amount === 'number' && amount !== 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )

/** Normalized, order-insensitive view of what the player would pay. */
export const solutionPaidSet = (solutions: readonly PaymentSolution[]): string[] =>
  [...new Set(solutions.map((solution) => resourceKey(solution.resourcesPaid)))].sort()

/** Normalized, order-insensitive view of a card-cost candidate list. */
export const candidateResourceSet = (
  candidates: readonly { resources: PaymentResourceMap }[],
): string[] =>
  [...new Set(candidates.map((candidate) => resourceKey(candidate.resources)))].sort()

export const feeResourceSet = (fees: readonly PaymentResourceMap[]): string[] =>
  [...new Set(fees.map(resourceKey))].sort()

export type PermutationRun<T, R> = {
  permutation: T[]
  result: R
}

/**
 * Runs `compute` once per permutation of `modifiers` and returns each
 * permutation paired with its normalized result. Callers assert that every
 * normalized result is identical.
 */
export const runPermutations = <T, R>(
  modifiers: readonly T[],
  compute: (ordered: T[]) => R,
): PermutationRun<T, R>[] =>
  permutations(modifiers).map((permutation) => ({
    permutation,
    result: compute(permutation),
  }))

export const distinctResults = <T>(runs: readonly PermutationRun<T, string[]>[]): string[] =>
  [...new Set(runs.map((run) => JSON.stringify(run.result)))]

export const createProbePlayer = (
  resources: Partial<PaymentResourceMap> = {},
): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      ...resources,
    },
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

export const createProbeState = (player: PlayerState): GameState =>
  ({
    players: [player],
    currentPlayerIndex: 0,
  }) as unknown as GameState

export type { CardCostCandidate, ComplexCost }
