import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'

import '../../shared/cards/C/C80_RockyTerrain'
import '../../shared/cards/B/B68_Beanfield'
import '../../shared/cards/B/B113_PatchCaregiver'
import '../../shared/cards/E/E70_CropRotationField'
import '../../shared/cards/D/D75_WoodField'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C80_RockyTerrain'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
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
    occupationHand: [], occupationPlayed: [], houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    extraOccupationsFromCards: [], playedCards: [], cardStates: {}, stats: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
    phase: 'playing', roundPhase: 'work', draft: null, enableCommunityDeck: false,
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

const expectPayGainStoneForFood = (result: { flow?: ActionFlow } | undefined) => {
  expect(result).toBeDefined()
  expect(result!.flow!.type).toBe('seq')
  const children = (result!.flow as Extract<ActionFlow, { children: ActionFlow[] }>).children
  const child0 = children[0] as Extract<ActionFlow, { type: 'leaf' }>
  const child1 = children[1] as Extract<ActionFlow, { type: 'leaf' }>
  expect(child0.actionId).toBe('pay')
  expect(child0.params).toEqual({ food: 1 })
  expect(child1.actionId).toBe('gain')
  expect(child1.params).toEqual({ stone: 1 })
}

describe('C80_RockyTerrain', () => {
  describe('plow trigger', () => {
    it('returns pay-gain flow after plow when player has food', () => {
      const listener = findListener('C80-rocky-terrain-after-plow')
      expect(listener).toBeDefined()

      const player = createPlayer()
      player.resources.food = 3
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('plow'),
        actionId: 'plow', phase: 'after',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })

    it('does not trigger plow flow when player has no food', () => {
      const listener = findListener('C80-rocky-terrain-after-plow')
      expect(listener).toBeDefined()

      const player = createPlayer()
      player.resources.food = 0
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('plow'),
        actionId: 'plow', phase: 'after',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })
  })

  describe('improvement field-card trigger (BGA onPlayerAfterImprovement)', () => {
    it('triggers when a minor field card (B68 Beanfield) is built', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      expect(listener).toBeDefined()

      const player = createPlayer()
      player.resources.food = 2
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('minor-improvement'),
        actionId: 'improvement-any', phase: 'after',
        choice: 'minor:B68_Beanfield',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })

    it('triggers when E70 CropRotationField is built', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      const player = createPlayer()
      player.resources.food = 1
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('minor-improvement'),
        actionId: 'improvement-any', phase: 'after',
        choice: 'minor:E70_CropRotationField',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })

    it('does not trigger when a non-field minor improvement is built', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      const player = createPlayer()
      player.resources.food = 5
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('minor-improvement'),
        actionId: 'improvement-any', phase: 'after',
        choice: 'minor:E54_Contraband',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('does not trigger when player has no food (even on field card)', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      const player = createPlayer()
      player.resources.food = 0
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('minor-improvement'),
        actionId: 'improvement-any', phase: 'after',
        choice: 'minor:B68_Beanfield',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('triggers on D75 Wood Field stub (isField=true even though impl deferred)', () => {
      const listener = findListener('C80-rocky-terrain-after-improvement-field')
      const player = createPlayer()
      player.resources.food = 1
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('minor-improvement'),
        actionId: 'improvement-any', phase: 'after',
        choice: 'minor:D75_WoodField',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })
  })

  describe('occupation field-card trigger (BGA onPlayerAfterOccupation)', () => {
    it('triggers when a field occupation (B113 PatchCaregiver) is played', () => {
      const listener = findListener('C80-rocky-terrain-after-occupation-field')
      expect(listener).toBeDefined()

      const player = createPlayer()
      player.resources.food = 2
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('lessons'),
        actionId: 'play-occupation', phase: 'after',
        choice: 'B113_PatchCaregiver',
      } as unknown as CardListenerContext)

      expectPayGainStoneForFood(result)
    })

    it('does not trigger when a non-field occupation is played', () => {
      const listener = findListener('C80-rocky-terrain-after-occupation-field')
      const player = createPlayer()
      player.resources.food = 5
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('lessons'),
        actionId: 'play-occupation', phase: 'after',
        choice: 'E51_WhaleOil',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('does not trigger when player has no food (even on field occupation)', () => {
      const listener = findListener('C80-rocky-terrain-after-occupation-field')
      const player = createPlayer()
      player.resources.food = 0
      const state = createState(player)

      const result = executeCardListener(listener!, {
        state, player, space: createSpace('lessons'),
        actionId: 'play-occupation', phase: 'after',
        choice: 'B113_PatchCaregiver',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })
  })
})
