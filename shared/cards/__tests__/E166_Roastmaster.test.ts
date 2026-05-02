import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../card-listeners'
import type { GameState, PlayerState, ActionSpace, ActionFlow } from '../../game/types'

import '../E/E166_Roastmaster'

const CARD_ID = 'E166_Roastmaster'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID], houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
  }) as unknown as PlayerState

const createSpace = (id: string, food = 0): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const createState = (player: PlayerState, fishingFood: number, travelingPlayersFood: number): GameState => {
  const fishing = createSpace('fishing', fishingFood)
  const tp = createSpace('traveling-players', travelingPlayersFood)
  return {
    round: 1, currentPlayerIndex: 0, players: [player],
    actionSpaces: [fishing, tp], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  } as unknown as GameState
}

describe('E166_Roastmaster', () => {
  const findListener = () =>
    getRegisteredCardListeners().find((l) => l.id === 'E166-roastmaster-before-place-farmer')

  it('returns a flow that moves 1 food fishing→traveling-players and gains 1 cattle', () => {
    const listener = findListener()
    expect(listener).toBeDefined()
    const player = createPlayer()
    const state = createState(player, /*fishingFood*/ 2, /*tpFood*/ 0)
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')!

    const result = executeCardListener(listener!, {
      state, player, space: fishing,
      actionId: 'place-farmer', phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    // Must contain at least: a move-food side effect and a gain cattle
    // The flow should be SEQ so that moving food and gaining cattle are atomic
    expect(children.length).toBeGreaterThanOrEqual(2)

    // The flow should reference both spaces: source 'fishing' and dest 'traveling-players'
    const flowJson = JSON.stringify(result!.flow)
    expect(flowJson).toContain('fishing')
    expect(flowJson).toContain('traveling-players')
  })

  it('skips when there is no food on the placed space', () => {
    const listener = findListener()
    const player = createPlayer()
    const state = createState(player, /*fishingFood*/ 0, /*tpFood*/ 0)
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')!

    const result = executeCardListener(listener!, {
      state, player, space: fishing,
      actionId: 'place-farmer', phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('skips on unrelated spaces', () => {
    const listener = findListener()
    const player = createPlayer()
    const state = createState(player, 2, 2)
    const grove = createSpace('grove', 0)

    const result = executeCardListener(listener!, {
      state, player, space: grove,
      actionId: 'place-farmer', phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
