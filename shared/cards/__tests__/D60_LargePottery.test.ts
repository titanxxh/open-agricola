import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../game/types'
import { playImprovement } from '../../actions/effects/improvement'
import { getPlayedCardKeys } from '../../game/player'
import { getCardEffect } from '../card-effects'
import { cardCountsAs, collectCardsAs } from '../helpers/card-type'
import { meetsCardPrerequisites } from '../helpers/prerequisites'

import '../D/D60_LargePottery'
import { D60_LargePottery as D60Card } from '../D/D60_LargePottery'

const CARD_ID = 'D60_LargePottery'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('D60_LargePottery', () => {
  it('card definition matches BGA (cost, vp, prerequisite, extraVp, alsoCountsAs, exchanges)', () => {
    expect(D60Card.cost).toEqual({ clay: 1, stone: 1 })
    expect(D60Card.vp).toBe(3)
    expect(D60Card.extraVp).toBe(true)
    expect(D60Card.evenMoreSet).toBe(true)
    expect(D60Card.prerequisite).toBe('Return the Pottery')
    expect(D60Card.returnCards).toBeUndefined()
    expect(D60Card.alsoCountsAs).toEqual(['major'])
    expect(D60Card.category).toBe('FOOD_PROVIDER')
    expect(D60Card.exchanges).toEqual([
      { from: { clay: 1 }, to: { food: 2 }, trigger: 'anytime' },
    ])
  })

  describe('computeBonusScore: scoresMap 3-4→1, 5→2, 6→3, 7+→4', () => {
    const fx = () => getCardEffect(CARD_ID)!.computeBonusScore!

    it.each([
      [0, 0], [1, 0], [2, 0],
      [3, 1], [4, 1],
      [5, 2], [6, 3],
      [7, 4], [8, 4], [12, 4],
    ])('clay=%i → bonus=%i', (clay, expected) => {
      const player = createPlayer()
      player.minorPlayed = [CARD_ID]
      player.resources.clay = clay
      expect(fx()(createState(player), player)).toBe(expected)
    })

  })

  describe('dual-type: D60 counts as both minor and major', () => {
    it('cardCountsAs(D60, "minor") === true', () => {
      expect(cardCountsAs(CARD_ID, 'minor')).toBe(true)
    })

    it('cardCountsAs(D60, "major") === true (via alsoCountsAs)', () => {
      expect(cardCountsAs(CARD_ID, 'major')).toBe(true)
    })

    it('collectCardsAs(player, "major") includes a played D60', () => {
      const player = createPlayer()
      player.minorPlayed = [CARD_ID]
      expect(collectCardsAs(player, 'major')).toContain(CARD_ID)
    })
  })

  describe('custom prerequisite + onBuy return flow', () => {
    it('requires a previously played Pottery to satisfy "Return the Pottery"', () => {
      const withoutPottery = createPlayer()
      expect(
        meetsCardPrerequisites(withoutPottery, { prerequisite: 'Return the Pottery' } as any),
      ).toBe(false)

      const withPottery = createPlayer()
      withPottery.improvements = ['Major_Pottery']
      expect(
        meetsCardPrerequisites(withPottery, { prerequisite: 'Return the Pottery' } as any),
      ).toBe(true)
    })

    it('buying D60 returns Major_Pottery to the board instead of encoding it in returnCards', () => {
      const player = createPlayer()
      player.minorHand = [CARD_ID]
      player.improvements = ['Major_Pottery']
      player.resources.clay = 1
      player.resources.stone = 1

      const state = createState(player)
      const result = playImprovement(state, player, CARD_ID, 'minor')

      expect(result.type).toBe('ok')
      expect(player.minorPlayed).toContain(CARD_ID)
      expect(player.minorHand).not.toContain(CARD_ID)
      expect(player.improvements).not.toContain('Major_Pottery')
      expect(getPlayedCardKeys(player)).not.toContain('major:Major_Pottery')
      expect(getPlayedCardKeys(player)).toContain(`minor:${CARD_ID}`)
      expect(state.availableMajorImprovements).toContain('Major_Pottery')
      expect(player.resources.clay).toBe(0)
      expect(player.resources.stone).toBe(0)
    })
  })

  describe('prerequisite checks: D60 satisfies "N Major Improvements" text clauses', () => {
    it('D60 alone satisfies "1 Major Improvement" prerequisite', () => {
      const player = createPlayer()
      player.minorPlayed = [CARD_ID]
      const result = meetsCardPrerequisites(player, {
        prerequisite: '1 Major Improvement',
      } as any)
      expect(result).toBe(true)
    })

    it('D60 + a native major satisfies "2 Major Improvements"', () => {
      const player = createPlayer()
      player.minorPlayed = [CARD_ID]
      player.improvements = ['Major_Fireplace1']
      const result = meetsCardPrerequisites(player, {
        prerequisite: '2 Major Improvements',
      } as any)
      expect(result).toBe(true)
    })

    it('a lone native major does not double-count as 2 majors', () => {
      const player = createPlayer()
      player.improvements = ['Major_Fireplace1']
      const result = meetsCardPrerequisites(player, {
        prerequisite: '2 Major Improvements',
      } as any)
      expect(result).toBe(false)
    })
  })
})
