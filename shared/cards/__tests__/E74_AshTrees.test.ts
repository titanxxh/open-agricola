import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { getCardEffect } from '../card-effects'
import { readPendingFenceBonus, storePendingFenceBonus } from '../helpers/pending-fence-bonus'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'

import '../E/E74_AshTrees'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [{ row: 0, col: 0, crop: 'grain', remaining: 1 }, { row: 0, col: 1, crop: 'grain', remaining: 1 }],
    fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: ['E74_AshTrees'],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: { E74_AshTrees: { counters: { fences: 4 } } },
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find((listener) => listener.id === id)

describe('E74_AshTrees', () => {
  it('stores only available fences on buy', () => {
    const effect = getCardEffect('E74_AshTrees')
    const player = createPlayer()
    player.fences = 13

    effect?.onBuy?.(createState(player), player)

    expect(player.cardStates?.E74_AshTrees?.counters?.fences).toBe(2)
  })

  it('offers free fence count choices before fencing', () => {
    const listener = findListener('E74-ash-trees-before-fence')
    const player = createPlayer()

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'before',
    } as any)

    expect(result?.flow?.type).toBe('xor')
    if (result?.flow?.type !== 'xor') return
    expect(result.flow.children).toHaveLength(5)
    expect(result.flow.children[0]).toMatchObject({
      type: 'leaf',
      actionId: 'reserve-fence-bonus',
      choiceLabelKey: 'ui.interactionAshTreesUseCount',
      choiceLabelParams: { count: 1 },
    })
  })

  it('marks fence action doable with stored fences even without wood', () => {
    const listener = findListener('E74-ash-trees-isdoable-fence')
    const player = createPlayer()
    player.resources.wood = 0

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'isDoable',
      doable: false,
    } as any)

    expect(result?.doable).toBe(true)
  })

  it('clears reserved free fences after fencing finishes', () => {
    const listener = findListener('E74-ash-trees-after-fence')
    const player = createPlayer()
    storePendingFenceBonus(player, {
      sourceCard: 'E74_AshTrees',
      counterKey: 'fences',
      freeFences: 2,
    })

    executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'after',
      choice: 'cancel',
      result: { type: 'ok' },
    } as any)

    expect(readPendingFenceBonus(player)).toBeUndefined()
  })
})
