import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../contract/types'
import { getCardEffect } from '../card-effects'

import '../D/D34_LuxuriousHostel'
import { D34_LuxuriousHostel as D34Card } from '../D/D34_LuxuriousHostel'

const CARD_ID = 'D34_LuxuriousHostel'

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
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 4, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
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

describe('D34_LuxuriousHostel', () => {
  it('card definition matches BGA (cost, flags, no purchase prereq)', () => {
    expect(D34Card.cost).toEqual({ wood: 1, clay: 2 })
    expect(D34Card.extraVp).toBe(true)
    expect(D34Card.newSet).toBe(true)
    expect(D34Card.prerequisite).toBeUndefined()
  })

  describe('computeBonusScore: bonus gated on stone house, not on purchase', () => {
    it('returns 0 when the player is still in a wooden house (purchase no longer blocked)', () => {
      const fx = getCardEffect(CARD_ID)!.computeBonusScore!
      const player = createPlayer()
      player.houseType = 'wood'
      player.rooms = 4
      expect(fx(createState(player), player)).toBe(0)
    })

    it('returns 4 when stone house has more rooms than people', () => {
      const fx = getCardEffect(CARD_ID)!.computeBonusScore!
      const player = createPlayer()
      player.houseType = 'stone'
      player.rooms = 4
      expect(fx(createState(player), player)).toBe(4)
    })

    it('returns 0 when stone house has rooms <= family size', () => {
      const fx = getCardEffect(CARD_ID)!.computeBonusScore!
      const player = createPlayer()
      player.houseType = 'stone'
      player.rooms = 2
      expect(fx(createState(player), player)).toBe(0)
    })

    it('returns 0 when the card is not in play', () => {
      const fx = getCardEffect(CARD_ID)!.computeBonusScore!
      const player = createPlayer()
      player.minorPlayed = []
      player.houseType = 'stone'
      player.rooms = 4
      expect(fx(createState(player), player)).toBe(0)
    })
  })
})
