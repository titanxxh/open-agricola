import { describe, expect, it } from 'vitest'
import {
  executeCardListener,
  getRegisteredCardListeners,
} from '../../shared/cards/card-listeners'
import { playImprovement } from '../../shared/actions/effects/improvement'
import type { ActionSpace, GameState, PlayerState } from '../../shared/game/types'

import '../../shared/cards/A/A41_VegetableSlicer'

const CARD_ID = 'A41_VegetableSlicer'
const FIREPLACE_ID = 'Major_Fireplace1'
const COOKING_HEARTH_ID = 'Major_CookingHearth1'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    },
    familySize: 2,
    workersAvailable: 2,
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    playedCards: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    newbornCount: 0,
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as PlayerState

const createState = (player: PlayerState): GameState =>
  ({
    round: 1,
    currentPlayerIndex: 0,
    players: [player],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: [COOKING_HEARTH_ID],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((listener) => listener.id === id)

describe('A41_VegetableSlicer improvement listener', () => {
  it('gains 2 wood and 1 vegetable when Fireplace becomes Cooking Hearth', () => {
    const listener = findListener('A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.improvements = [FIREPLACE_ID]

    const state = createState(player)
    const result = playImprovement(state, player, `major:${COOKING_HEARTH_ID}`, 'any')

    expect(result.type).toBe('ok')
    const hookResult = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('improvement-any'),
      actionId: 'improvement-any',
      phase: 'after',
      choice: `major:${COOKING_HEARTH_ID}`,
      result,
    } as any)

    expect(player.improvements).toContain(COOKING_HEARTH_ID)
    expect(player.improvements).not.toContain(FIREPLACE_ID)
    expect(hookResult?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: 2, vegetable: 1 },
    })
  })

  it('does not trigger on a pure clay Cooking Hearth purchase', () => {
    const listener = findListener('A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.resources.clay = 4

    const state = createState(player)
    const result = playImprovement(state, player, `major:${COOKING_HEARTH_ID}`, 'any')

    expect(result.type).toBe('ok')
    const hookResult = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('improvement-any'),
      actionId: 'improvement-any',
      phase: 'after',
      choice: `major:${COOKING_HEARTH_ID}`,
      result,
    } as any)

    expect(player.improvements).toContain(COOKING_HEARTH_ID)
    expect(hookResult).toBeUndefined()
  })
})
