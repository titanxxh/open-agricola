import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import { getPlayerActionSpaceConfig } from '../player-action-space'
import type { GameState, PlayerState, ActionSpace, Resource } from '../../contract/types'

import '../C/C39_StudioBoat'
import type { ActionExecutionContext } from '../../contract/types'

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

  describe('execute action space (1-3p semantics)', () => {
    it('collects accumulated food from the space for the actor', () => {
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

      const result = def.execute({ state, player: user, space } as unknown as ActionExecutionContext)
      expect(result.type).toBe('ok')
      expect(user.resources.food).toBe(3)
      expect(space.resources.food).toBe(0)
    })

    it('grants +1 bonus VP to the owner only when the owner uses it', () => {
      const config = getPlayerActionSpaceConfig(CARD_ID)!
      const def = config.createDefinition('p1')
      const owner = createPlayer('p1')
      const state = createState(owner)
      const space = createSpace(CARD_ID, {
        resources: { ...emptyResources, food: 2 },
      })
      state.actionSpaces = [space]

      def.execute({ state, player: owner, space } as unknown as ActionExecutionContext)
      expect(owner.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
      expect(owner.resources.food).toBe(2)
    })

    it('does NOT grant +1 bonus VP when a non-owner uses it', () => {
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

      def.execute({ state, player: user, space } as unknown as ActionExecutionContext)
      expect(user.resources.food).toBe(2)
      expect(owner.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    })

    it('accumulates bonusVp across multiple owner uses', () => {
      const config = getPlayerActionSpaceConfig(CARD_ID)!
      const def = config.createDefinition('p1')
      const owner = createPlayer('p1')
      const state = createState(owner)
      const space = createSpace(CARD_ID, {
        resources: { ...emptyResources, food: 1 },
      })
      state.actionSpaces = [space]

      def.execute({ state, player: owner, space } as unknown as ActionExecutionContext)
      space.resources.food = 2
      def.execute({ state, player: owner, space } as unknown as ActionExecutionContext)
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


    it('does not accumulate if space does not exist', () => {
      const effect = getCardEffect(CARD_ID)!
      const owner = createPlayer()
      const state = createState(owner)
      // No space created; should not throw
      expect(() => effect.onRoundStart!(state, owner)).not.toThrow()
    })
  })

  describe('player-count gating', () => {
    it('registers the action space in 1p / 2p / 3p games', () => {
      for (const pc of [1, 2, 3] as const) {
        const players = Array.from({ length: pc }, (_, i) =>
          createPlayer(`p${i + 1}`, `P${i + 1}`),
        )
        players[0].minorPlayed = [CARD_ID]
        const state = createState(...players)
        const effect = getCardEffect(CARD_ID)!
        effect.onBuy!(state, players[0])
        expect(state.actionSpaces.find((s) => s.id === CARD_ID)).toBeDefined()
      }
    })

    it('does NOT register the action space in 4p games', () => {
      const players = Array.from({ length: 4 }, (_, i) =>
        createPlayer(`p${i + 1}`, `P${i + 1}`),
      )
      players[0].minorPlayed = [CARD_ID]
      const state = createState(...players)
      const effect = getCardEffect(CARD_ID)!
      effect.onBuy!(state, players[0])
      expect(state.actionSpaces.find((s) => s.id === CARD_ID)).toBeUndefined()
    })

    it('onRoundStart accumulates food only in 1-3p', () => {
      const effect = getCardEffect(CARD_ID)!
      // 2p
      const small = createState(createPlayer('p1'), createPlayer('p2', 'P2'))
      small.players[0].minorPlayed = [CARD_ID]
      effect.onBuy!(small, small.players[0])
      effect.onRoundStart!(small, small.players[0])
      expect(small.actionSpaces.find((s) => s.id === CARD_ID)?.resources.food).toBe(1)

      // 4p — no space, so no food anywhere with this id
      const big = createState(
        createPlayer('p1'), createPlayer('p2', 'P2'),
        createPlayer('p3', 'P3'), createPlayer('p4', 'P4'),
      )
      big.players[0].minorPlayed = [CARD_ID]
      effect.onBuy!(big, big.players[0])
      effect.onRoundStart!(big, big.players[0])
      expect(big.actionSpaces.find((s) => s.id === CARD_ID)).toBeUndefined()
    })
  })
})

describe('C39_StudioBoat prerequisite (BGA: 1 Occupation min)', () => {
  it('declares occupationPrerequisites: { min: 1 }', async () => {
    const { C39_StudioBoat } = await import('../C/C39_StudioBoat')
    expect(C39_StudioBoat.occupationPrerequisites).toEqual({ min: 1 })
  })

  it('declares prerequisite text "1 Occupation"', async () => {
    const { C39_StudioBoat } = await import('../C/C39_StudioBoat')
    expect(C39_StudioBoat.prerequisite).toBe('1 Occupation')
  })

  it('meetsCardPrerequisites: 0 occupations → false', async () => {
    const { C39_StudioBoat } = await import('../C/C39_StudioBoat')
    const { meetsCardPrerequisites } = await import('../helpers/prerequisites')
    const player = { occupationPlayed: [], minorPlayed: [], improvements: [], cardStates: {} } as unknown as PlayerState
    expect(meetsCardPrerequisites(player, C39_StudioBoat, 1)).toBe(false)
  })

  it('meetsCardPrerequisites: 1 occupation → true', async () => {
    const { C39_StudioBoat } = await import('../C/C39_StudioBoat')
    const { meetsCardPrerequisites } = await import('../helpers/prerequisites')
    const player = { occupationPlayed: ['Some_Occ'], minorPlayed: [], improvements: [], cardStates: {} } as unknown as PlayerState
    expect(meetsCardPrerequisites(player, C39_StudioBoat, 1)).toBe(true)
  })
})
