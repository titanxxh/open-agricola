import type { GameState, PlayerState, Resource } from '../game/types'
import { FARM_COLS, FARM_ROWS, positionKey } from '../game/farm'
import { computeFencedRegions } from './farm'
import { getMajorCardEffect } from '../cards/major'

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
  | 'beggings'

export type ScoreEntry =
  | { type: 'quantity'; quantity: number; score: number }
  | { type: 'card'; cardId: string; cardType: 'major' | 'minor' | 'occupation'; score: number }
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
    const edgeSet = new Set(player.fenceSegments)
    computeFencedRegions(edgeSet)
      .filter((region) => region.fenced)
      .forEach((region) => {
        region.tiles.forEach((tile) => keys.add(positionKey(tile)))
      })
  }
  return keys
}

const totalTiles = FARM_ROWS * FARM_COLS

export const computeScores = (state: GameState): PlayerScoreSummary[] =>
  state.players.map((player) => {
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
      entries: [{ type: 'quantity', quantity: pastureCount, score: pastureScore }],
    })

    const grainCount =
      player.resources.grain +
      player.fields.filter((field) => field.crop === 'grain').length
    const grainScore = scoreByRanges(grainCount, ['0', '1-3', '4-5', '6-7', '8+'])
    categories.push({
      key: 'grains',
      total: grainScore,
      quantity: grainCount,
      entries: [{ type: 'quantity', quantity: grainCount, score: grainScore }],
    })

    const vegetableCount =
      player.resources.vegetable +
      player.fields.filter((field) => field.crop === 'vegetable').length
    const vegetableScore = scoreByRanges(vegetableCount, ['0', '1', '2', '3', '4+'])
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

    const farmerScore = player.familySize * 3
    categories.push({
      key: 'farmers',
      total: farmerScore,
      quantity: player.familySize,
      entries: [
        { type: 'quantity', quantity: player.familySize, score: farmerScore },
      ],
    })

    const cardEntries: ScoreEntry[] = []
    const cardBonusEntries: ScoreEntry[] = []
    player.improvements.forEach((cardId) => {
      const card = getMajorCardEffect(cardId)
      if (!card) return
      cardEntries.push({ type: 'card', cardId, cardType: 'major', score: card.vp })
      if (card.scoring) {
        const resourceCount = player.resources[card.scoring.resource] ?? 0
        const bonusScore = scoreByMap(resourceCount, card.scoring.map)
        cardBonusEntries.push({
          type: 'cardBonus',
          cardId,
          cardType: 'major',
          score: bonusScore,
          quantity: resourceCount,
          resource: card.scoring.resource,
        })
      }
    })
    player.minorPlayed.forEach((cardId) => {
      cardEntries.push({ type: 'card', cardId, cardType: 'minor', score: 0 })
    })
    player.occupationPlayed.forEach((cardId) => {
      cardEntries.push({ type: 'card', cardId, cardType: 'occupation', score: 0 })
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
    if (cardStateBonusVp > 0) {
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
      entries: [{ type: 'quantity', quantity: beggingCount, score: beggingScore }],
    })

    const total = categories.reduce((sum, category) => sum + category.total, 0)
    return {
      playerId: player.id,
      playerName: player.name,
      categories,
      total,
    }
  })
