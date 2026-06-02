import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../contract/types'
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
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2, houseType: 'wood',
  fields: [], fences: 0,
  roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
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

const setA136Reserve = (player: PlayerState, sets: number) => {
  const scoreMap = [0, 1, 3, 5]
  player.cardStates = {
    ...(player.cardStates ?? {}),
    A136_DrudgeryReeve: {
      extraData: {
        scoringReserveBonus: {
          reserved: { wood: sets, clay: sets, stone: sets, reed: sets },
          score: scoreMap[sets] ?? 0,
          cardType: 'occupation',
        },
      },
    },
  }
}

describe('selected Scoring Reserve bonus scoring', () => {
  it('scores selected reserve bonuses with card attribution before major resource scoring', () => {
    const player = createPlayer()
    const sourceCard = 'TEST_ScoringReserveCard'
    player.occupationPlayed = [sourceCard]
    player.improvements = ['Major_Joinery']
    player.resources.wood = 5
    player.cardStates = {
      [sourceCard]: {
        extraData: {
          scoringReserveBonus: {
            reserved: { wood: 2 },
            score: 3,
          },
        },
      },
    }

    const [result] = computeScores(createState(player))

    expect(player.resources.wood).toBe(5)
    expect(getCategory(result, 'cardBonusVp')).toEqual(
      expect.objectContaining({
        total: 4,
        entries: expect.arrayContaining([
          {
            type: 'bonus',
            score: 3,
            cardId: sourceCard,
            cardType: 'occupation',
            reserved: { wood: 2 },
          },
          {
            type: 'bonus',
            cardId: 'Major_Joinery',
            cardType: 'major',
            score: 1,
          },
        ]),
      }),
    )
    expect(getCategory(result, 'cardsBonus')).toBeUndefined()
    expect(getCategory(result, 'cardStateBonusVp')).toBeUndefined()
  })

  it('applies selected scoring reserve before automatic costed-bonus solver work', () => {
    const player = createPlayer()
    const sourceCard = 'TEST_ScoringReserveCard'
    player.occupationPlayed = [sourceCard, 'C133_Soldier']
    player.resources.wood = 3
    player.resources.stone = 3
    player.cardStates = {
      [sourceCard]: {
        extraData: {
          scoringReserveBonus: {
            reserved: { wood: 2 },
            score: 5,
          },
        },
      },
    }

    const [result] = computeScores(createState(player))

    expect(getCategory(result, 'cardBonusVp')).toEqual(
      expect.objectContaining({
        total: 6,
        entries: expect.arrayContaining([
          {
            type: 'bonus',
            score: 5,
            cardId: sourceCard,
            cardType: 'occupation',
            reserved: { wood: 2 },
          },
          {
            type: 'bonus',
            cardId: 'C133_Soldier',
            cardType: 'occupation',
            score: 1,
          },
        ]),
      }),
    )
  })
})

// ─── C133_Soldier standalone ────────────────────────────────────────

describe('C133_Soldier scoring', () => {
  it('scores min(wood, stone) as bonus VP', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.resources.wood = 4
    player.resources.stone = 2

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(2)
  })

  it('scores 0 when no wood', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.resources.stone = 5

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardBonusVp')).toBeUndefined()
  })

  it('scores 0 when card not played', () => {
    const player = createPlayer()
    player.resources.wood = 5
    player.resources.stone = 5

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardBonusVp')).toBeUndefined()
  })

  it('reserves wood and stone from Joinery scoring', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.improvements = ['Major_Joinery']
    player.resources.wood = 5
    player.resources.stone = 3

    const [result] = computeScores(createState(player))
    // Soldier: min(5, 3) = 3 pairs → 3 bonus VP, reserves 3 wood + 3 stone
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(3)
    // Joinery: 5 wood - 3 reserved = 2 effective wood → 0 score (needs 3+)
    expect(getCategory(result, 'cardsBonus')).toBeUndefined()
  })

  it('Joinery still scores when enough wood remains after Soldier', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.improvements = ['Major_Joinery']
    player.resources.wood = 7
    player.resources.stone = 2

    const [result] = computeScores(createState(player))
    // Soldier: min(7, 2) = 2 pairs → 2 bonus VP, reserves 2 wood
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(4)
    // Joinery: 7 wood - 2 reserved = 5 effective wood → 2 score
    expect(getCategory(result, 'cardBonusVp')?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: 'C133_Soldier', score: 2 }),
        expect.objectContaining({ cardId: 'Major_Joinery', score: 2 }),
      ]),
    )
  })
})

// ─── A136_DrudgeryReeve standalone ──────────────────────────────────

describe('A136_DrudgeryReeve scoring', () => {
  it('does not score automatically from resources before a player chooses sets', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    player.resources.wood = 3
    player.resources.clay = 3
    player.resources.stone = 3
    player.resources.reed = 3

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardBonusVp')).toBeUndefined()
  })

  it('scores 1/3/5 bonus VP from selected reserve sets', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    setA136Reserve(player, 2)
    player.resources.wood = 5
    player.resources.clay = 5
    player.resources.stone = 5
    player.resources.reed = 5

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(3)
    expect(getCategory(result, 'cardBonusVp')?.entries).toEqual([
      {
        type: 'bonus',
        score: 3,
        cardId: 'A136_DrudgeryReeve',
        cardType: 'occupation',
        reserved: { wood: 2, clay: 2, stone: 2, reed: 2 },
      },
    ])
  })

  it('keeps A136 attribution for non-owner players scoring from another player card', () => {
    const player = createPlayer()
    setA136Reserve(player, 3)
    player.resources.wood = 3
    player.resources.clay = 3
    player.resources.stone = 3
    player.resources.reed = 3

    const [result] = computeScores(createState(player))
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(5)
    expect(getCategory(result, 'cardBonusVp')?.entries).toEqual([
      {
        type: 'bonus',
        score: 5,
        cardId: 'A136_DrudgeryReeve',
        cardType: 'occupation',
        reserved: { wood: 3, clay: 3, stone: 3, reed: 3 },
      },
    ])
  })

  it('reserves all 4 resources from Major improvement scoring', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    player.improvements = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']
    setA136Reserve(player, 3)
    player.resources.wood = 3
    player.resources.clay = 3
    player.resources.stone = 3
    player.resources.reed = 3

    const [result] = computeScores(createState(player))
    // DrudgeryReeve: 3 sets → 5 VP, reserves 3 of each
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(5)
    // All Majors: 0 remaining resources → 0 bonus
    expect(getCategory(result, 'cardsBonus')).toBeUndefined()
  })
})

// ─── DrudgeryReeve + Soldier combined ───────────────────────────────

describe('DrudgeryReeve + Soldier resource conflict', () => {
  it('DrudgeryReeve scores first, Soldier gets remaining wood+stone', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve', 'C133_Soldier']
    setA136Reserve(player, 2)
    player.resources.wood = 5
    player.resources.clay = 2
    player.resources.stone = 4
    player.resources.reed = 2

    const [result] = computeScores(createState(player))
    // DrudgeryReeve: min(5,2,4,2,3) = 2 sets → 3 VP, reserves 2 wood/clay/stone/reed
    // Soldier: min(5-2, 4-2) = min(3, 2) = 2 pairs → 2 VP, reserves 2 more wood+stone
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(5) // 3 + 2
  })

  it('DrudgeryReeve + Soldier + Joinery: all compete for wood', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve', 'C133_Soldier']
    player.improvements = ['Major_Joinery']
    setA136Reserve(player, 1)
    player.resources.wood = 7
    player.resources.clay = 1
    player.resources.stone = 3
    player.resources.reed = 1

    const [result] = computeScores(createState(player))
    // DrudgeryReeve: min(7,1,3,1,3) = 1 set → 1 VP, reserves 1 wood/clay/stone/reed
    // Soldier: min(7-1, 3-1) = min(6, 2) = 2 pairs → 2 VP, reserves 2 more wood+stone
    // Total bonus: 3
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(4)
    // Joinery: 7 wood - 1 (DR) - 2 (Soldier) = 4 effective wood → 1 score (3-4 range)
    expect(getCategory(result, 'cardBonusVp')?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: 'A136_DrudgeryReeve', score: 1 }),
        expect.objectContaining({ cardId: 'C133_Soldier', score: 2 }),
        expect.objectContaining({ cardId: 'Major_Joinery', score: 1 }),
      ]),
    )
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
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(7)
    // Pottery: 5 clay - 0 reserved = 5 → 2 score
    // Basketmaker: 4 reed - 0 reserved = 4 → 2 score
    expect(getCategory(result, 'cardBonusVp')?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: 'C133_Soldier', score: 3 }),
        expect.objectContaining({ cardId: 'Major_Pottery', score: 2 }),
        expect.objectContaining({ cardId: 'Major_Basket', score: 2 }),
      ]),
    )
  })

  it('DrudgeryReeve reserves reed, affecting Basketmaker', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A136_DrudgeryReeve']
    player.improvements = ['Major_Basket']
    setA136Reserve(player, 2)
    player.resources.wood = 2
    player.resources.clay = 2
    player.resources.stone = 2
    player.resources.reed = 5

    const [result] = computeScores(createState(player))
    // DrudgeryReeve: min(2,2,2,5,3) = 2 sets → 3 VP
    expect(getCategory(result, 'cardBonusVp')?.total).toBe(4)
    // Basketmaker: 5 reed - 2 reserved = 3 → 1 score (2-3 range)
    expect(getCategory(result, 'cardBonusVp')?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: 'A136_DrudgeryReeve', score: 3 }),
        expect.objectContaining({ cardId: 'Major_Basket', score: 1 }),
      ]),
    )
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
