import type { GameState, PlayerState, Resource } from '../game/types'
import type {
  BonusScoreLevel,
  BonusScoringContext,
  BonusScoreHandler,
  CostedBonusHandler,
} from '../cards/card-effects'

export type SolverInput = {
  state: GameState
  player: PlayerState
  ctx: BonusScoringContext
  freeHandlers: { cardId: string; handler: BonusScoreHandler }[]
  costedHandlers: { cardId: string; handler: CostedBonusHandler }[]
}

export type SolverEntry = {
  cardId: string
  score: number
  cost: Partial<Resource>
}

export type SolverResult = {
  entries: SolverEntry[]
  totalScore: number
  totalCost: Partial<Resource>
}

// Mirrors keyof Resource — keep in sync if Resource type changes.
// REAL_RESOURCE_KEYS in shared/game/resource-keys.ts excludes 'food' ordering differs;
// keep a local copy here to avoid coupling solver to resource-key conventions.
const RESOURCE_KEYS: (keyof Resource)[] = [
  'food', 'wood', 'clay', 'stone', 'reed',
  'grain', 'vegetable',
  'sheep', 'boar', 'cattle', 'begging',
]

function canAfford(have: Partial<Resource>, need: Partial<Resource>): boolean {
  for (const k of RESOURCE_KEYS) {
    if ((have[k] ?? 0) < (need[k] ?? 0)) return false
  }
  return true
}

function addResources(a: Partial<Resource>, b: Partial<Resource>): Partial<Resource> {
  const out: Partial<Resource> = { ...a }
  for (const k of RESOURCE_KEYS) {
    const v = b[k]
    if (v !== undefined && v !== 0) out[k] = (out[k] ?? 0) + v
  }
  return out
}

function subtractResources(a: Partial<Resource>, b: Partial<Resource>): Partial<Resource> {
  const out: Partial<Resource> = { ...a }
  for (const k of RESOURCE_KEYS) {
    const v = b[k]
    if (v !== undefined && v !== 0) out[k] = Math.max(0, (out[k] ?? 0) - v)
  }
  return out
}

export function solveBonusScoring(input: SolverInput): SolverResult {
  const { state, player, ctx, freeHandlers, costedHandlers } = input
  const playerResourcesSnapshot: Partial<Resource> = { ...player.resources }

  // 1. Collect levels per costed card (call handlers once on snapshot state)
  const allLevels: { cardId: string; levels: BonusScoreLevel[] }[] = costedHandlers.map(({ cardId, handler }) => {
    let levels: BonusScoreLevel[]
    try {
      levels = handler(state, player, ctx)
    } catch (err) {
      if (cardId.startsWith('CUSTOM_')) {
        console.warn(`[scoring-bonus-solver] custom card ${cardId} threw, skipping:`, err)
        levels = [{ cost: {}, score: 0 }]
      } else {
        throw err
      }
    }
    if (levels.length === 0) levels = [{ cost: {}, score: 0 }]
    return { cardId, levels }
  })

  // 2. Enumerate Cartesian product, track best
  let bestScore = -Infinity
  let bestCombo: { cardId: string; level: BonusScoreLevel }[] = []
  let bestCost: Partial<Resource> = {}

  function recurse(idx: number, accCombo: { cardId: string; level: BonusScoreLevel }[], accCost: Partial<Resource>) {
    if (idx === allLevels.length) {
      if (!canAfford(playerResourcesSnapshot, accCost)) return
      const remaining = subtractResources(playerResourcesSnapshot, accCost)
      const playerClone = { ...player, resources: { ...player.resources, ...remaining } } as PlayerState
      const costedScore = accCombo.reduce((sum, { level }) => sum + level.score, 0)
      let freeScore = 0
      for (const { cardId, handler } of freeHandlers) {
        try {
          freeScore += handler(state, playerClone, ctx)
        } catch (err) {
          if (cardId.startsWith('CUSTOM_')) {
            console.warn(`[scoring-bonus-solver] custom card ${cardId} threw, skipping:`, err)
          } else {
            throw err
          }
        }
      }
      const total = costedScore + freeScore
      if (total > bestScore) {
        bestScore = total
        bestCombo = [...accCombo]
        bestCost = { ...accCost }
      }
      return
    }
    for (const level of allLevels[idx].levels) {
      const nextCost = addResources(accCost, level.cost)
      if (!canAfford(playerResourcesSnapshot, nextCost)) continue
      accCombo.push({ cardId: allLevels[idx].cardId, level })
      recurse(idx + 1, accCombo, nextCost)
      accCombo.pop()
    }
  }
  recurse(0, [], {})

  // Edge: if every combination was infeasible (shouldn't happen since {cost:{},score:0} fits)
  if (bestScore === -Infinity) {
    bestScore = 0
    bestCombo = []
    bestCost = {}
  }

  // 3. Commit: mutate player.resources
  for (const k of RESOURCE_KEYS) {
    const c = bestCost[k] ?? 0
    if (c > 0) {
      player.resources[k] = (player.resources[k] ?? 0) - c
    }
  }

  // 4. Build entries — re-call free handlers on committed state for entry log
  const freeEntries: SolverEntry[] = []
  for (const { cardId, handler } of freeHandlers) {
    let score = 0
    try {
      score = handler(state, player, ctx)
    } catch (err) {
      if (cardId.startsWith('CUSTOM_')) {
        console.warn(`[scoring-bonus-solver] custom card ${cardId} threw, skipping:`, err)
        score = 0
      } else {
        throw err
      }
    }
    if (score !== 0) freeEntries.push({ cardId, score, cost: {} })
  }
  const costedEntries: SolverEntry[] = bestCombo.map(({ cardId, level }) => ({
    cardId,
    score: level.score,
    cost: level.cost,
  }))

  return {
    entries: [...freeEntries, ...costedEntries],
    totalScore: bestScore,
    totalCost: bestCost,
  }
}
