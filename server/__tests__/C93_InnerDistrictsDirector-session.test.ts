import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/C/C93_InnerDistrictsDirector'

const CARD_ID = 'C93_InnerDistrictsDirector'

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
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID], playedCards: [`occupation:${CARD_ID}`],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
  }) as PlayerState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const createState = (player: PlayerState): GameState => {
  const forestSpace = createSpace('forest')
  const clayPitSpace = createSpace('clay-pit')
  return {
    round: 1, currentPlayerIndex: 0, players: [player],
    actionSpaces: [forestSpace, clayPitSpace], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  } as GameState
}

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C93_InnerDistrictsDirector', () => {
  it('places 1 stone on clay-pit when using forest', () => {
    const listener = findListener('C93-inner-districts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    const forestSpace = state.actionSpaces.find(s => s.id === 'forest')!
    const clayPitSpace = state.actionSpaces.find(s => s.id === 'clay-pit')!

    expect(clayPitSpace.resources.stone).toBe(0)

    const result = executeCardListener(listener!, {
      state, player, space: forestSpace,
      actionId: 'place-farmer', phase: 'after',
    } as any)

    // Stone should be placed on clay-pit
    expect(clayPitSpace.resources.stone).toBe(1)
    // Should offer place-farmer
    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as any).children
    expect(children[0].actionId).toBe('place-farmer')
  })

  it('places 1 stone on forest when using clay-pit', () => {
    const listener = findListener('C93-inner-districts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    const forestSpace = state.actionSpaces.find(s => s.id === 'forest')!
    const clayPitSpace = state.actionSpaces.find(s => s.id === 'clay-pit')!

    expect(forestSpace.resources.stone).toBe(0)

    executeCardListener(listener!, {
      state, player, space: clayPitSpace,
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(forestSpace.resources.stone).toBe(1)
  })

  it('does not offer place-farmer when no workers available', () => {
    const listener = findListener('C93-inner-districts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)
    markAllWorkersUsed(state, player)

    const result = executeCardListener(listener!, {
      state, player, space: state.actionSpaces.find(s => s.id === 'forest')!,
      actionId: 'place-farmer', phase: 'after',
    } as any)

    // Stone still placed but no farmer flow returned
    expect(result).toBeUndefined()
    expect(state.actionSpaces.find(s => s.id === 'clay-pit')!.resources.stone).toBe(1)
  })

  it('does not trigger on unrelated spaces', () => {
    const listener = findListener('C93-inner-districts-director-after-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('farmland'),
      actionId: 'place-farmer', phase: 'after',
    } as any)

    expect(result).toBeUndefined()
  })
})
