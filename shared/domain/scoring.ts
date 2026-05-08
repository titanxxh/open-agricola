import type { GameState, PlayerState, Resource } from '../contract/types.ts'
import { FARM_COLS, FARM_ROWS, positionKey } from '../domain/farm.ts'
import { fieldHasCrop } from '../domain/field.ts'
import { getMajorCard } from '../cards/major/index.ts'
import {
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
} from '../cards-display/types'
import { isMajorCardId } from '../cards/helpers/card-type.ts'
import { getCardEffect } from '../cards/card-effects.ts'
import type {
  BonusScoreLevel,
  BonusScoringContext,
  BonusScoreHandler,
  CostedBonusHandler,
} from '../cards/card-effects.ts'
import { familySize } from '../domain/player.ts'
import { computeFencedRegions } from './farmyard.ts'

// ---------------------------------------------------------------------------
// Score types (formerly exported from `shared/logic/scoring.ts`).
// ---------------------------------------------------------------------------

type ScoreCategoryKey =
  | 'fields'
  | 'pastures'
  | 'grains'
  | 'vegetables'
  | 'sheeps'
  | 'boars'
  | 'cattles'
  | 'empty'
  | 'stables'
  | 'clayRooms'
  | 'stoneRooms'
  | 'farmers'
  | 'cards'
  | 'cardsBonus'
  | 'cardStateBonusVp'
  | 'beggings'

export type ScoreEntry =
  | { type: 'quantity'; quantity: number; score: number }
  | {
      type: 'card'
      cardId: string
      cardType: 'major' | 'minor' | 'occupation'
      score: number
    }
  | { type: 'bonus'; score: number }
  | {
      type: 'cardBonus'
      cardId: string
      cardType: 'major'
      score: number
      quantity: number
      resource: keyof Resource
    }

export type ScoreCategoryResult = {
  key: ScoreCategoryKey
  total: number
  quantity?: number
  entries: ScoreEntry[]
}

export type PlayerScoreSummary = {
  playerId: string
  playerName: string
  categories: ScoreCategoryResult[]
  total: number
}

// ---------------------------------------------------------------------------
// Bonus solver types + impl (formerly `shared/logic/scoring-bonus-solver.ts`).
// ---------------------------------------------------------------------------

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

const RESOURCE_KEYS: (keyof Resource)[] = [
  'food',
  'wood',
  'clay',
  'stone',
  'reed',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
]

function canAffordResources(
  have: Partial<Resource>,
  need: Partial<Resource>,
): boolean {
  for (const k of RESOURCE_KEYS) {
    if ((have[k] ?? 0) < (need[k] ?? 0)) return false
  }
  return true
}

function addResources(
  a: Partial<Resource>,
  b: Partial<Resource>,
): Partial<Resource> {
  const out: Partial<Resource> = { ...a }
  for (const k of RESOURCE_KEYS) {
    const v = b[k]
    if (v !== undefined && v !== 0) out[k] = (out[k] ?? 0) + v
  }
  return out
}

function subtractResources(
  a: Partial<Resource>,
  b: Partial<Resource>,
): Partial<Resource> {
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

  const allLevels: { cardId: string; levels: BonusScoreLevel[] }[] =
    costedHandlers.map(({ cardId, handler }) => {
      let levels: BonusScoreLevel[]
      try {
        levels = handler(state, player, ctx)
      } catch (err) {
        if (cardId.startsWith('CUSTOM_')) {
          console.warn(
            `[scoring-bonus-solver] custom card ${cardId} threw, skipping:`,
            err,
          )
          levels = [{ cost: {}, score: 0 }]
        } else {
          throw err
        }
      }
      if (levels.length === 0) levels = [{ cost: {}, score: 0 }]
      return { cardId, levels }
    })

  let bestScore = -Infinity
  let bestCombo: { cardId: string; level: BonusScoreLevel }[] = []
  let bestCost: Partial<Resource> = {}

  function recurse(
    idx: number,
    accCombo: { cardId: string; level: BonusScoreLevel }[],
    accCost: Partial<Resource>,
  ) {
    if (idx === allLevels.length) {
      if (!canAffordResources(playerResourcesSnapshot, accCost)) return
      const remaining = subtractResources(playerResourcesSnapshot, accCost)
      const playerClone = {
        ...player,
        resources: { ...player.resources, ...remaining },
      } as PlayerState
      const costedScore = accCombo.reduce(
        (sum, { level }) => sum + level.score,
        0,
      )
      let freeScore = 0
      for (const { cardId, handler } of freeHandlers) {
        try {
          freeScore += handler(state, playerClone, ctx)
        } catch (err) {
          if (cardId.startsWith('CUSTOM_')) {
            console.warn(
              `[scoring-bonus-solver] custom card ${cardId} threw, skipping:`,
              err,
            )
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
      if (!canAffordResources(playerResourcesSnapshot, nextCost)) continue
      accCombo.push({ cardId: allLevels[idx].cardId, level })
      recurse(idx + 1, accCombo, nextCost)
      accCombo.pop()
    }
  }
  recurse(0, [], {})

  if (bestScore === -Infinity) {
    bestScore = 0
    bestCombo = []
    bestCost = {}
  }

  for (const k of RESOURCE_KEYS) {
    const c = bestCost[k] ?? 0
    if (c > 0) {
      player.resources[k] = (player.resources[k] ?? 0) - c
    }
  }

  const freeEntries: SolverEntry[] = []
  for (const { cardId, handler } of freeHandlers) {
    let score = 0
    try {
      score = handler(state, player, ctx)
    } catch (err) {
      if (cardId.startsWith('CUSTOM_')) {
        console.warn(
          `[scoring-bonus-solver] custom card ${cardId} threw, skipping:`,
          err,
        )
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

// ---------------------------------------------------------------------------
// computeScores (formerly `shared/logic/scoring.ts`).
// ---------------------------------------------------------------------------

const parseQuantityRange = (range: string) => {
  if (range.includes('-')) {
    const [min, max] = range.split('-').map(Number)
    return { min, max }
  }
  if (range.includes('+')) {
    const [min] = range.split('+').map(Number)
    return { min, max: Number.POSITIVE_INFINITY }
  }
  const value = Number(range)
  return { min: value, max: value }
}

const scoreByRanges = (quantity: number, ranges: string[]) => {
  const scores = [-1, 1, 2, 3, 4]
  for (let index = 0; index < ranges.length; index += 1) {
    const { min, max } = parseQuantityRange(ranges[index] ?? '')
    if (quantity >= min && quantity <= max) {
      return scores[index] ?? 0
    }
  }
  return 0
}

const scoreByMap = (quantity: number, map: Record<string, number>) => {
  let score = 0
  Object.entries(map).forEach(([range, value]) => {
    const { min, max } = parseQuantityRange(range)
    if (quantity >= min && quantity <= max) {
      score = value
    }
  })
  return score
}

const getPastureTileKeys = (player: PlayerState) => {
  const keys = new Set<string>()
  player.pastures.forEach((pasture) => {
    pasture.tiles?.forEach((tile) => keys.add(positionKey(tile)))
  })
  const needsFallback = player.pastures.some(
    (pasture) => !pasture.tiles || pasture.tiles.length === 0,
  )
  if (needsFallback && player.fenceSegments.length > 0) {
    const edgeSet = new Set(player.fenceSegments.map((s) => s.edge))
    computeFencedRegions(edgeSet)
      .filter((region) => region.fenced)
      .forEach((region) => {
        region.tiles.forEach((tile) => keys.add(positionKey(tile)))
      })
  }
  return keys
}

const totalTiles = FARM_ROWS * FARM_COLS

const applyPostScoreAdjustment = (
  categories: ScoreCategoryResult[],
  score: number,
) => {
  if (score === 0) return

  const bonusCategory = categories.find((c) => c.key === 'cardStateBonusVp')
  if (bonusCategory) {
    bonusCategory.total += score
    bonusCategory.entries.push({ type: 'bonus', score })
    return
  }

  categories.push({
    key: 'cardStateBonusVp',
    total: score,
    entries: [{ type: 'bonus', score }],
  })
}

export const computeScores = (state: GameState): PlayerScoreSummary[] => {
  const summaries = state.players.map((player) => {
    const categories: ScoreCategoryResult[] = []

    const fieldCount = player.fields.length
    const fieldScore = scoreByRanges(fieldCount, ['0-1', '2', '3', '4', '5+'])
    categories.push({
      key: 'fields',
      total: fieldScore,
      quantity: fieldCount,
      entries: [{ type: 'quantity', quantity: fieldCount, score: fieldScore }],
    })

    const pastureCount = player.pastures.length
    const pastureScore = scoreByRanges(pastureCount, ['0', '1', '2', '3', '4+'])
    categories.push({
      key: 'pastures',
      total: pastureScore,
      quantity: pastureCount,
      entries: [
        { type: 'quantity', quantity: pastureCount, score: pastureScore },
      ],
    })

    const grainCount =
      player.resources.grain +
      player.fields.filter((field) => fieldHasCrop(field, 'grain')).length
    const grainScore = scoreByRanges(grainCount, ['0', '1-3', '4-5', '6-7', '8+'])
    categories.push({
      key: 'grains',
      total: grainScore,
      quantity: grainCount,
      entries: [{ type: 'quantity', quantity: grainCount, score: grainScore }],
    })

    const vegetableCount =
      player.resources.vegetable +
      player.fields.filter((field) => fieldHasCrop(field, 'vegetable')).length
    const vegetableScore = scoreByRanges(
      vegetableCount,
      ['0', '1', '2', '3', '4+'],
    )
    categories.push({
      key: 'vegetables',
      total: vegetableScore,
      quantity: vegetableCount,
      entries: [
        { type: 'quantity', quantity: vegetableCount, score: vegetableScore },
      ],
    })

    const sheepCount = player.resources.sheep
    const sheepScore = scoreByRanges(sheepCount, ['0', '1-3', '4-5', '6-7', '8+'])
    categories.push({
      key: 'sheeps',
      total: sheepScore,
      quantity: sheepCount,
      entries: [{ type: 'quantity', quantity: sheepCount, score: sheepScore }],
    })

    const boarCount = player.resources.boar
    const boarScore = scoreByRanges(boarCount, ['0', '1-2', '3-4', '5-6', '7+'])
    categories.push({
      key: 'boars',
      total: boarScore,
      quantity: boarCount,
      entries: [{ type: 'quantity', quantity: boarCount, score: boarScore }],
    })

    const cattleCount = player.resources.cattle
    const cattleScore = scoreByRanges(cattleCount, ['0', '1', '2-3', '4-5', '6+'])
    categories.push({
      key: 'cattles',
      total: cattleScore,
      quantity: cattleCount,
      entries: [{ type: 'quantity', quantity: cattleCount, score: cattleScore }],
    })

    const usedTiles = new Set<string>()
    player.roomTiles.forEach((tile) => usedTiles.add(positionKey(tile)))
    player.fields.forEach((field) =>
      usedTiles.add(positionKey({ row: field.row, col: field.col })),
    )
    player.stableTiles.forEach((tile) => usedTiles.add(positionKey(tile)))
    getPastureTileKeys(player).forEach((key) => usedTiles.add(key))
    const emptyCount = Math.max(0, totalTiles - usedTiles.size)
    const emptyScore = emptyCount * -1
    categories.push({
      key: 'empty',
      total: emptyScore,
      quantity: emptyCount,
      entries: [{ type: 'quantity', quantity: emptyCount, score: emptyScore }],
    })

    const fencedStables = player.pastures.reduce(
      (sum, pasture) => sum + pasture.stables,
      0,
    )
    categories.push({
      key: 'stables',
      total: fencedStables,
      quantity: fencedStables,
      entries: [
        { type: 'quantity', quantity: fencedStables, score: fencedStables },
      ],
    })

    const roomCount = player.roomTiles.length
    const clayRooms = player.houseType === 'clay' ? roomCount : 0
    const stoneRooms = player.houseType === 'stone' ? roomCount : 0
    categories.push({
      key: 'clayRooms',
      total: clayRooms,
      quantity: clayRooms,
      entries: [{ type: 'quantity', quantity: clayRooms, score: clayRooms }],
    })
    categories.push({
      key: 'stoneRooms',
      total: stoneRooms * 2,
      quantity: stoneRooms,
      entries: [
        { type: 'quantity', quantity: stoneRooms, score: stoneRooms * 2 },
      ],
    })

    const playerFamilySize = familySize(player)
    const farmerScore = playerFamilySize * 3
    categories.push({
      key: 'farmers',
      total: farmerScore,
      quantity: playerFamilySize,
      entries: [
        { type: 'quantity', quantity: playerFamilySize, score: farmerScore },
      ],
    })

    // Solve bonus scoring (free + costed). Solver mutates `player.resources -= bestCost`
    // on the object it receives. We pass a SHALLOW CLONE (resources spread one level)
    // so `computeScores` stays a pure function — repeat invocations (e.g. UI re-render)
    // must not double-deduct. Major scoring + free handlers downstream read the same
    // clone, so they observe the post-solve remaining values.
    const bonusCtx: BonusScoringContext = { categories: [...categories] }
    const allCardsForBonus = [
      ...player.improvements,
      ...player.minorPlayed,
      ...player.occupationPlayed,
    ]
    const freeHandlers = allCardsForBonus
      .map((cardId) => ({ cardId, effect: getCardEffect(cardId) }))
      .filter(
        (
          x,
        ): x is {
          cardId: string
          effect: NonNullable<ReturnType<typeof getCardEffect>>
        } => !!x.effect?.computeBonusScore,
      )
      .map(({ cardId, effect }) => ({
        cardId,
        handler: effect.computeBonusScore!,
      }))
    const costedHandlers = allCardsForBonus
      .map((cardId) => ({ cardId, effect: getCardEffect(cardId) }))
      .filter(
        (
          x,
        ): x is {
          cardId: string
          effect: NonNullable<ReturnType<typeof getCardEffect>>
        } => !!x.effect?.computeCostedBonus,
      )
      .map(({ cardId, effect }) => ({
        cardId,
        handler: effect.computeCostedBonus!,
      }))
    const playerForBonus = { ...player, resources: { ...player.resources } }
    const bonusScoreResult = solveBonusScoring({
      state,
      player: playerForBonus,
      ctx: bonusCtx,
      freeHandlers,
      costedHandlers,
    })

    const cardEntries: ScoreEntry[] = []
    const cardBonusEntries: ScoreEntry[] = []
    player.improvements.forEach((cardId) => {
      if (!isMajorCardId(cardId)) return
      const card = getMajorCard(cardId)
      if (!card) return
      cardEntries.push({
        type: 'card',
        cardId,
        cardType: 'major',
        score: card.vp ?? 0,
      })
      if (card.scoring) {
        const scoringResource = card.scoring.resource as keyof Resource
        const resourceCount = Math.max(
          0,
          playerForBonus.resources[scoringResource] ?? 0,
        )
        const bonusScore = scoreByMap(resourceCount, card.scoring.map)
        cardBonusEntries.push({
          type: 'cardBonus',
          cardId,
          cardType: 'major',
          score: bonusScore,
          quantity: resourceCount,
          resource: scoringResource,
        })
      }
    })
    player.minorPlayed.forEach((cardId) => {
      const vp = getRegisteredMinorImprovement(cardId)?.vp ?? 0
      cardEntries.push({ type: 'card', cardId, cardType: 'minor', score: vp })
    })
    player.occupationPlayed.forEach((cardId) => {
      const vp = getRegisteredOccupation(cardId)?.vp ?? 0
      cardEntries.push({
        type: 'card',
        cardId,
        cardType: 'occupation',
        score: vp,
      })
    })
    const cardsTotal = cardEntries.reduce((sum, entry) => sum + entry.score, 0)
    const cardsBonusTotal = cardBonusEntries.reduce(
      (sum, entry) => sum + entry.score,
      0,
    )
    categories.push({
      key: 'cards',
      total: cardsTotal,
      entries: cardEntries,
    })
    categories.push({
      key: 'cardsBonus',
      total: cardsBonusTotal,
      entries: cardBonusEntries,
    })

    let cardStateBonusVp = 0
    if (player.cardStates) {
      Object.entries(player.cardStates).forEach(([cardId, cardState]) => {
        if (cardId === '__pendingChoice__') return
        const vp = cardState.counters?.bonusVp ?? 0
        if (vp > 0) {
          cardStateBonusVp += vp
        }
      })
    }

    for (const entry of bonusScoreResult.entries) {
      cardStateBonusVp += entry.score
    }

    if (cardStateBonusVp !== 0) {
      categories.push({
        key: 'cardStateBonusVp',
        total: cardStateBonusVp,
        entries: [{ type: 'bonus' as const, score: cardStateBonusVp }],
      })
    }

    const beggingCount = player.resources.begging
    const beggingScore = beggingCount * -3
    categories.push({
      key: 'beggings',
      total: beggingScore,
      quantity: beggingCount,
      entries: [
        { type: 'quantity', quantity: beggingCount, score: beggingScore },
      ],
    })

    const total = categories.reduce((sum, category) => sum + category.total, 0)
    return {
      playerId: player.id,
      playerName: player.name,
      categories,
      total,
    }
  })

  const summariesByPlayerId = new Map(
    summaries.map((summary) => [summary.playerId, summary] as const),
  )

  state.players.forEach((owner) => {
    const allCards = [
      ...owner.improvements,
      ...owner.minorPlayed,
      ...owner.occupationPlayed,
    ]
    allCards.forEach((cardId) => {
      const effect = getCardEffect(cardId)
      if (!effect?.computeSharedPostScore) return

      const adjustments = effect.computeSharedPostScore(state, owner, summaries)
      adjustments.forEach(({ playerId, score }) => {
        const summary = summariesByPlayerId.get(playerId)
        if (!summary) return
        applyPostScoreAdjustment(summary.categories, score)
        summary.total += score
      })
    })
  })

  return summaries
}

// ---------------------------------------------------------------------------
// Scoring namespace — domain facade over scoring queries.
// ---------------------------------------------------------------------------

/** Compute full per-player score summaries (one entry per player). */
function computeAll(state: GameState): PlayerScoreSummary[] {
  return computeScores(state)
}

/** Solve cross-player bonus scoring (which player wins each comparison). */
function solveBonus(input: SolverInput): SolverResult {
  return solveBonusScoring(input)
}

/** Single player's score breakdown by index. Throws on out-of-range. */
function breakdown(state: GameState, idx: number): PlayerScoreSummary {
  const all = computeScores(state)
  const entry = all[idx]
  if (!entry) throw new Error(`Scoring.breakdown: no player at index ${idx}`)
  return entry
}

/** Convenience: total score for a single player by index. */
function totalFor(state: GameState, idx: number): number {
  return breakdown(state, idx).total
}

/**
 * Cross-player scoring views. Top-level (NOT under PlayerBoard) because
 * scoring is inherently a multi-player query.
 */
export const Scoring = {
  computeAll,
  solveBonus,
  breakdown,
  totalFor,
} as const
