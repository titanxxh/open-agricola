import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../game/types'
import { computeScores } from '../scoring'
import { getCardEffect } from '../../cards/card-effects'

// Register card effects for scoring
import '../../cards/C/C133_Soldier'
import '../../cards/A/A136_DrudgeryReeve'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (id = 'p1'): PlayerState => ({
  id, name: id, color: 'red',
  resources: emptyResources(),
  familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
  fields: [], fences: 0,
  roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [], playedCards: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  newbornCount: 0, pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  cardStates: {},
}) as PlayerState

const createState = (...players: PlayerState[]): GameState => ({
  round: 14, currentPlayerIndex: 0, players,
  actionSpaces: [], log: [], roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [],
  futureMeeples: [], pendingFutureMeeples: [],
  gameOver: true, workPhaseObtainedResources: {},
}) as GameState

const getCategory = (result: ReturnType<typeof computeScores>[0], key: string) =>
  result.categories.find((c) => c.key === key)

// ─── C133_Soldier standalone ────────────────────────────────────────

describe('C133_Soldier scoring', () => {
  it('scores min(wood, stone) as bonus VP', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.resources.wood = 4
    player.resources.stone = 2

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(2)
  })

  it('scores 0 when no wood', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.resources.stone = 5

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardStateBonusVp')).toBeUndefined()
  })

  it('scores 0 when card not played', () => {
    const player = createPlayer()
    player.resources.wood = 5
    player.resources.stone = 5

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardStateBonusVp')).toBeUndefined()
  })

  it('reserves wood and stone from Joinery scoring', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.improvements = ['Major_Joinery']
    player.resources.wood = 5
    player.resources.stone = 3

    const [result] = computeScores(createState(player))
    // Soldier: min(5, 3) = 3 pairs → 3 bonus VP, reserves 3 wood + 3 stone
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(3)
    // Joinery: 5 wood - 3 reserved = 2 effective wood → 0 score (needs 3+)
    expect(getCategory(result, 'cardsBonus')?.total).toBe(0)
  })

  it('Joinery still scores when enough wood remains after Soldier', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.improvements = ['Major_Joinery']
    player.resources.wood = 7
    player.resources.stone = 2

    const [result] = computeScores(createState(player))
    // Soldier: min(7, 2) = 2 pairs → 2 bonus VP, reserves 2 wood
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(2)
    // Joinery: 7 wood - 2 reserved = 5 effective wood → 2 score
    expect(getCategory(result, 'cardsBonus')?.total).toBe(2)
  })
})

// ─── A136_DrudgeryReeve standalone ──────────────────────────────────

describe('A136_DrudgeryReeve scoring', () => {
  it('scores 1 bonus VP for 1 set of building resources', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    player.resources.wood = 1
    player.resources.clay = 1
    player.resources.stone = 1
    player.resources.reed = 1

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(1)
  })

  it('scores 3 bonus VP for 2 sets', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    player.resources.wood = 2
    player.resources.clay = 2
    player.resources.stone = 2
    player.resources.reed = 2

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(3)
  })

  it('scores 5 bonus VP for 3 sets (capped at 3)', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    player.resources.wood = 5
    player.resources.clay = 4
    player.resources.stone = 3
    player.resources.reed = 10

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(5)
  })

  it('scores 0 when missing one resource type', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    player.resources.wood = 5
    player.resources.clay = 0
    player.resources.stone = 5
    player.resources.reed = 5

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardStateBonusVp')).toBeUndefined()
  })

  it('reserves all 4 resources from Major improvement scoring', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    player.improvements = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']
    player.resources.wood = 3
    player.resources.clay = 3
    player.resources.stone = 3
    player.resources.reed = 3

    const [result] = computeScores(createState(player))
    // DrudgeryReeve: 3 sets → 5 VP, reserves 3 of each
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(5)
    // All Majors: 0 remaining resources → 0 bonus
    expect(getCategory(result, 'cardsBonus')?.total).toBe(0)
  })
})

// ─── DrudgeryReeve + Soldier combined ───────────────────────────────

describe('DrudgeryReeve + Soldier resource conflict', () => {
  it('DrudgeryReeve scores first, Soldier gets remaining wood+stone', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve', 'C133_Soldier']
    player.resources.wood = 5
    player.resources.clay = 2
    player.resources.stone = 4
    player.resources.reed = 2

    const [result] = computeScores(createState(player))
    // DrudgeryReeve: min(5,2,4,2,3) = 2 sets → 3 VP, reserves 2 wood/clay/stone/reed
    // Soldier: min(5-2, 4-2) = min(3, 2) = 2 pairs → 2 VP, reserves 2 more wood+stone
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(5) // 3 + 2
  })

  it('DrudgeryReeve + Soldier + Joinery: all compete for wood', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve', 'C133_Soldier']
    player.improvements = ['Major_Joinery']
    player.resources.wood = 7
    player.resources.clay = 1
    player.resources.stone = 3
    player.resources.reed = 1

    const [result] = computeScores(createState(player))
    // DrudgeryReeve: min(7,1,3,1,3) = 1 set → 1 VP, reserves 1 wood/clay/stone/reed
    // Soldier: min(7-1, 3-1) = min(6, 2) = 2 pairs → 2 VP, reserves 2 more wood+stone
    // Total bonus: 3
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(3)
    // Joinery: 7 wood - 1 (DR) - 2 (Soldier) = 4 effective wood → 1 score (3-4 range)
    expect(getCategory(result, 'cardsBonus')?.total).toBe(1)
  })

  it('Soldier alone does not affect Pottery or Basketmaker', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.improvements = ['Major_Pottery', 'Major_Basket']
    player.resources.wood = 3
    player.resources.stone = 3
    player.resources.clay = 5
    player.resources.reed = 4

    const [result] = computeScores(createState(player))
    // Soldier: min(3, 3) = 3 pairs → 3 VP, reserves 3 wood + 3 stone
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(3)
    // Pottery: 5 clay - 0 reserved = 5 → 2 score
    // Basketmaker: 4 reed - 0 reserved = 4 → 2 score
    expect(getCategory(result, 'cardsBonus')?.total).toBe(4) // 2 + 2
  })

  it('DrudgeryReeve reserves reed, affecting Basketmaker', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    player.improvements = ['Major_Basket']
    player.resources.wood = 2
    player.resources.clay = 2
    player.resources.stone = 2
    player.resources.reed = 5

    const [result] = computeScores(createState(player))
    // DrudgeryReeve: min(2,2,2,5,3) = 2 sets → 3 VP
    expect(getCategory(result, 'cardStateBonusVp')?.total).toBe(3)
    // Basketmaker: 5 reed - 2 reserved = 3 → 1 score (2-3 range)
    expect(getCategory(result, 'cardsBonus')?.total).toBe(1)
  })
})

// ─── A136_DrudgeryReeve onBuy ───────────────────────────────────────

describe('A136_DrudgeryReeve onBuy', () => {
  it('gives wood based on remaining rounds', () => {
    // Import to get the card effect
    const effect = getCardEffect('A136_DrudgeryReeve')
    expect(effect?.onBuy).toBeDefined()

    // Round 5 → 14-5=9 remaining → 4 wood
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    const state = createState(player)
    state.round = 5
    const flow = effect!.onBuy!(state, player)
    expect(flow?.type).toBe('leaf')
    if (flow?.type === 'leaf') {
      expect(flow.params).toEqual({ wood: 4 })
    }
  })

  it('gives 1 wood when 1 round remaining', () => {
    const effect = getCardEffect('A136_DrudgeryReeve')

    const player = createPlayer()
    const state = createState(player)
    state.round = 13 // 14-13=1 remaining → 1 wood
    const flow = effect!.onBuy!(state, player)
    expect(flow?.type).toBe('leaf')
    if (flow?.type === 'leaf') {
      expect(flow.params).toEqual({ wood: 1 })
    }
  })

  it('gives 0 wood on last round', () => {
    const effect = getCardEffect('A136_DrudgeryReeve')

    const player = createPlayer()
    const state = createState(player)
    state.round = 14 // 14-14=0 remaining → 0 wood
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })
})
