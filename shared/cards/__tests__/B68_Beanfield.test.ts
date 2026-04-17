import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../B/B68_Beanfield'
import { B68_Beanfield as B68Card } from '../B/B68_Beanfield'

const CARD_ID = 'B68_Beanfield'

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
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('B68_Beanfield', () => {
  it('card definition has correct properties', () => {
    expect(B68Card.cost).toEqual({ food: 1 })
    expect(B68Card.vp).toBe(1)
    expect(B68Card.occupationPrerequisites).toEqual({ min: 2 })
  })

  describe('onComputeSowableFields', () => {
    it('returns extra vegetable-only field when card is empty', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      const fields = effect.onComputeSowableFields!(player)
      expect(fields).toHaveLength(1)
      expect(fields[0].allowedCrops).toEqual(['vegetable'])
      expect(fields[0].sourceCard).toBe(CARD_ID)
      expect(fields[0].tile).toEqual({ row: -1, col: 68 })
    })

    it('returns empty when card already has a crop', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      player.cardStates = { [CARD_ID]: { extraData: { cardCrop: { crop: 'vegetable', remaining: 2 } } } } as any
      const fields = effect.onComputeSowableFields!(player)
      expect(fields).toHaveLength(0)
    })

    it('returns empty when card is not played', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      player.minorPlayed = []
      const fields = effect.onComputeSowableFields!(player)
      expect(fields).toHaveLength(0)
    })
  })

  describe('onSowExtraField', () => {
    it('sows vegetable on virtual tile and deducts resource', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      player.resources.vegetable = 3
      const result = effect.onSowExtraField!(player, { row: -1, col: 68 }, 'vegetable')
      expect(result).toBe(true)
      expect(player.resources.vegetable).toBe(2)
      expect(player.cardStates![CARD_ID]!.extraData!.cardCrop).toEqual({ crop: 'vegetable', remaining: 2 })
    })

    it('rejects grain on beanfield', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      player.resources.grain = 3
      const result = effect.onSowExtraField!(player, { row: -1, col: 68 }, 'grain')
      expect(result).toBe(false)
    })

    it('rejects sow on wrong tile', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      player.resources.vegetable = 3
      const result = effect.onSowExtraField!(player, { row: -1, col: 99 }, 'vegetable')
      expect(result).toBe(false)
    })

    it('rejects sow when card already has crop', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      player.resources.vegetable = 3
      player.cardStates = { [CARD_ID]: { extraData: { cardCrop: { crop: 'vegetable', remaining: 1 } } } } as any
      const result = effect.onSowExtraField!(player, { row: -1, col: 68 }, 'vegetable')
      expect(result).toBe(false)
    })

    it('rejects sow when player has no vegetable', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      player.resources.vegetable = 0
      const result = effect.onSowExtraField!(player, { row: -1, col: 68 }, 'vegetable')
      expect(result).toBe(false)
    })
  })

  describe('onHarvestFieldPhase', () => {
    it('harvests 1 vegetable and decrements remaining', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      player.cardStates = { [CARD_ID]: { extraData: { cardCrop: { crop: 'vegetable', remaining: 2 } } } } as any
      const state = createState(player)
      effect.onHarvestFieldPhase!(state, player)
      expect(player.resources.vegetable).toBe(1)
      expect(player.cardStates![CARD_ID]!.extraData!.cardCrop).toEqual({ crop: 'vegetable', remaining: 1 })
    })

    it('clears card crop when last vegetable is harvested', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      player.cardStates = { [CARD_ID]: { extraData: { cardCrop: { crop: 'vegetable', remaining: 1 } } } } as any
      const state = createState(player)
      effect.onHarvestFieldPhase!(state, player)
      expect(player.resources.vegetable).toBe(1)
      expect(player.cardStates![CARD_ID]!.extraData!.cardCrop).toBeNull()
    })

    it('does nothing when card has no crop', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      const state = createState(player)
      effect.onHarvestFieldPhase!(state, player)
      expect(player.resources.vegetable).toBe(0)
    })
  })

  describe('isDoable listener', () => {
    it('makes sow doable when card is empty and player has vegetable', () => {
      const listener = findListener('B68-beanfield-isdoable-sow')!
      expect(listener).toBeDefined()
      const player = createPlayer()
      player.resources.vegetable = 1
      // No normal fields, so canSow() returns false
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'isDoable',
      } as any)
      expect(result).toBeDefined()
      expect(result!.doable).toBe(true)
    })

    it('does not make sow doable when player has no vegetable', () => {
      const listener = findListener('B68-beanfield-isdoable-sow')!
      const player = createPlayer()
      player.resources.vegetable = 0
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'isDoable',
      } as any)
      expect(result).toBeUndefined()
    })

    it('does not intervene when normal sow is already doable', () => {
      const listener = findListener('B68-beanfield-isdoable-sow')!
      const player = createPlayer()
      player.resources.vegetable = 1
      // Add a normal empty field so canSow() returns true
      player.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }] as any
      const result = executeCardListener(listener, {
        state: createState(player), player, space: createSpace('sow'),
        actionId: 'sow', phase: 'isDoable',
      } as any)
      expect(result).toBeUndefined()
    })
  })
})
