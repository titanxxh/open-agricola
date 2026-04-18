import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import { getPlayerActionSpaceConfig } from '../player-action-space'
import type { GameState, PlayerState, ActionSpace, Resource } from '../../game/types'

import '../C/C39_StudioBoat'

const CARD_ID = 'C39_StudioBoat'

const emptyResources: Resource = {
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
}

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
    resources: { ...emptyResources },
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
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as PlayerState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { ...emptyResources },
    takenBy: [],
    ...overrides,
  }) as ActionSpace

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [],
    log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

describe('C39_StudioBoat', () => {
  describe('PlayerActionSpace registration', () => {
    it('is registered as a player action space', () => {
      const config = getPlayerActionSpaceConfig(CARD_ID)
      expect(config).toBeDefined()
      expect(config!.access).toBe('all')
    })

    it('creates a definition that anyone can use', () => {
      const config = getPlayerActionSpaceConfig(CARD_ID)!
      const def = config.createDefinition('p1')
      const state = createState(createPlayer())
      const otherPlayer = createPlayer('p2', 'P2')
      expect(def.canBeExecutedByPlayer(state, otherPlayer)).toBe(true)
    })
  })

  describe('execute action space', () => {
    it('collects accumulated food from the space', () => {
      const config = getPlayerActionSpaceConfig(CARD_ID)!
      const def = config.createDefinition('p1')
      const owner = createPlayer('p1')
      const user = createPlayer('p2', 'P2')
      user.minorPlayed = []
      const state = createState(owner, user)
      const space = createSpace(CARD_ID, {
        resources: { ...emptyResources, food: 3 },
      })
      state.actionSpaces = [space]

      const result = def.execute({ state, player: user, space } as any)
      expect(result.type).toBe('ok')
      expect(user.resources.food).toBe(3) // collected 3 food
      expect(space.resources.food).toBe(0) // space emptied
    })

    it('gives +1 bonus VP to the owner when anyone uses it', () => {
      const config = getPlayerActionSpaceConfig(CARD_ID)!
      const def = config.createDefinition('p1')
      const owner = createPlayer('p1')
      const user = createPlayer('p2', 'P2')
      user.minorPlayed = []
      const state = createState(owner, user)
      const space = createSpace(CARD_ID, {
        resources: { ...emptyResources, food: 2 },
      })
      state.actionSpaces = [space]

      def.execute({ state, player: user, space } as any)
      expect(owner.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
    })

    it('gives +1 bonus VP to owner even when owner uses it', () => {
      const config = getPlayerActionSpaceConfig(CARD_ID)!
      const def = config.createDefinition('p1')
      const owner = createPlayer('p1')
      const state = createState(owner)
      const space = createSpace(CARD_ID, {
        resources: { ...emptyResources, food: 2 },
      })
      state.actionSpaces = [space]

      def.execute({ state, player: owner, space } as any)
      expect(owner.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
      expect(owner.resources.food).toBe(2)
    })

    it('accumulates bonusVp across multiple uses', () => {
      const config = getPlayerActionSpaceConfig(CARD_ID)!
      const def = config.createDefinition('p1')
      const owner = createPlayer('p1')
      const user = createPlayer('p2', 'P2')
      user.minorPlayed = []
      const state = createState(owner, user)
      const space = createSpace(CARD_ID, {
        resources: { ...emptyResources, food: 1 },
      })
      state.actionSpaces = [space]

      def.execute({ state, player: user, space } as any)
      space.resources.food = 2 // simulate next round accumulation
      def.execute({ state, player: owner, space } as any)
      expect(owner.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(2)
    })
  })

  describe('onBuy', () => {
    it('creates the action space in state', () => {
      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const owner = createPlayer()
      const state = createState(owner)
      expect(state.actionSpaces.find(s => s.id === CARD_ID)).toBeUndefined()
      effect!.onBuy!(state, owner)
      const space = state.actionSpaces.find(s => s.id === CARD_ID)
      expect(space).toBeDefined()
    })

    it('does not duplicate the space if already exists', () => {
      const effect = getCardEffect(CARD_ID)!
      const owner = createPlayer()
      const state = createState(owner)
      effect.onBuy!(state, owner)
      const countBefore = state.actionSpaces.filter(s => s.id === CARD_ID).length
      effect.onBuy!(state, owner)
      const countAfter = state.actionSpaces.filter(s => s.id === CARD_ID).length
      expect(countAfter).toBe(countBefore)
    })
  })

  describe('onRoundStart accumulation', () => {
    it('adds 1 food to the action space each round', () => {
      const effect = getCardEffect(CARD_ID)!
      const owner = createPlayer()
      const state = createState(owner)
      // First create the space
      effect.onBuy!(state, owner)
      const space = state.actionSpaces.find(s => s.id === CARD_ID)!
      expect(space.resources.food).toBe(0)

      // Simulate round start
      effect.onRoundStart!(state, owner)
      expect(space.resources.food).toBe(1)

      // Another round
      effect.onRoundStart!(state, owner)
      expect(space.resources.food).toBe(2)
    })

    it('does not accumulate if player does not have card', () => {
      const effect = getCardEffect(CARD_ID)!
      const owner = createPlayer()
      owner.minorPlayed = [] // no card
      const state = createState(owner)
      const space = createSpace(CARD_ID, { resources: { ...emptyResources, food: 0 } })
      state.actionSpaces = [space]

      effect.onRoundStart!(state, owner)
      expect(space.resources.food).toBe(0)
    })

    it('does not accumulate if space does not exist', () => {
      const effect = getCardEffect(CARD_ID)!
      const owner = createPlayer()
      const state = createState(owner)
      // No space created; should not throw
      expect(() => effect.onRoundStart!(state, owner)).not.toThrow()
    })
  })
})
