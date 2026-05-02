import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace, ActionFlow } from '../../shared/game/types'

import '../../shared/cards/C/C132_TimberShingleMaker'

const CARD_ID = 'C132_TimberShingleMaker'
const LISTENER_ID = 'C132-timber-shingle-maker-after-renovate'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1', name: 'p1', color: 'red',
    resources: {
      wood: 5, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
    ],
    rooms: 3, houseType: 'stone',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID], houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
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

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C132_TimberShingleMaker — XOR child writes woodPlaced counter', () => {
  it('each XOR child SEQ ends with a special-effect increment-counter writing woodPlaced', () => {
    const listener = findListener(LISTENER_ID)
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.rooms = 3
    player.resources.wood = 5
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const xor = result!.flow as Extract<ActionFlow, { type: 'xor' }>
    expect(xor.type).toBe('xor')
    expect(xor.children).toHaveLength(3)

    // Each branch must contain a special-effect leaf with kind='increment-counter' targeting woodPlaced
    for (let i = 0; i < xor.children.length; i++) {
      const branch = xor.children[i] as Extract<ActionFlow, { type: 'seq' }>
      expect(branch.type).toBe('seq')
      const incCounterLeaf = branch.children.find(
        (c) =>
          c.type === 'leaf' &&
          c.actionId === 'special-effect' &&
          (c.params as { kind?: string; key?: string; amount?: number })?.kind === 'increment-counter' &&
          (c.params as { kind?: string; key?: string; amount?: number })?.key === 'woodPlaced',
      ) as Extract<ActionFlow, { type: 'leaf' }> | undefined
      expect(incCounterLeaf).toBeDefined()
      expect((incCounterLeaf!.params as { amount?: number }).amount).toBe(i + 1)
    }
  })
})
