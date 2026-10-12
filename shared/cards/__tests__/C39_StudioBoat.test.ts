import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import { getPlayerActionSpaceConfig } from '../player-action-space'
import type { GameState, PlayerState, Resource } from '../../contract/types'

import '../C/C039_StudioBoat'

const CARD_ID = 'C039_StudioBoat'

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

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [],
    log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

describe('C039_StudioBoat', () => {
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

  })
})

describe('C039_StudioBoat prerequisite (reference: 1 Occupation min)', () => {
  it('declares occupationPrerequisites: { min: 1 }', async () => {
    const { C039_StudioBoat } = await import('../../cards/C/C039_StudioBoat')
    expect(C039_StudioBoat.occupationPrerequisites).toEqual({ min: 1 })
  })

  it('declares prerequisite text "1 Occupation"', async () => {
    const { C039_StudioBoat } = await import('../../cards/C/C039_StudioBoat')
    expect(C039_StudioBoat.prerequisite).toBe('1 Occupation')
  })

  it('meetsCardPrerequisites: 0 occupations → false', async () => {
    const { C039_StudioBoat } = await import('../../cards/C/C039_StudioBoat')
    const { meetsCardPrerequisites } = await import('../helpers/prerequisites')
    const player = { occupationPlayed: [], minorPlayed: [], improvements: [], cardStates: {} } as unknown as PlayerState
    expect(meetsCardPrerequisites(player, C039_StudioBoat, 1)).toBe(false)
  })

  it('meetsCardPrerequisites: 1 occupation → true', async () => {
    const { C039_StudioBoat } = await import('../../cards/C/C039_StudioBoat')
    const { meetsCardPrerequisites } = await import('../helpers/prerequisites')
    const player = { occupationPlayed: ['Some_Occ'], minorPlayed: [], improvements: [], cardStates: {} } as unknown as PlayerState
    expect(meetsCardPrerequisites(player, C039_StudioBoat, 1)).toBe(true)
  })
})
