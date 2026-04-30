import { describe, expect, it } from 'vitest'
import { runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../game/types'

import '../A/A151_Minstrel'

const CARD_ID = 'A151_Minstrel'

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
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
    ...overrides,
  }) as ActionSpace

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 4, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [
      createSpace('sheep-market', { takenBy: [{ playerId: 'p1', workerId: '1' }], gainPerRound: { sheep: 1 }, resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 3, boar: 0, cattle: 0, begging: 0 } }),
      createSpace('grain-utilization', { takenBy: [{ playerId: 'p1', workerId: '1' }] }),
      createSpace('fencing', { takenBy: [{ playerId: 'p1', workerId: '1' }] }),
      createSpace('major-improvement', { takenBy: [] }),
    ],
    log: [], roundStartSnapshot: null,
    // Stage 1 actions in positions 1-4
    roundActionOrder: [
      'sheep-market', 'grain-utilization', 'fencing', 'major-improvement',
      null, null, null, null, null, null, null, null, null, null,
    ],
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('A151_Minstrel', () => {
  it('returns jumpLeaf for major-improvement when exactly 1 stage-1 space is unoccupied', () => {
    const player = createPlayer()
    const state = createState(player)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).not.toBeNull()
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)
    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('place-farmer')
    expect(leaf.expandFlow).toBe(true)
    expect(leaf.actionContext?.viaCardJump).toBe(true)
    expect(leaf.actionContext?.targetSpaceId).toBe('major-improvement')
    expect(leaf.actionContext?.workerId).toBeUndefined()
    expect(leaf.actionContext?.sourceCard).toBe(CARD_ID)
  })

  it('returns nothing when more than 1 stage-1 space is unoccupied', () => {
    const player = createPlayer()
    const state = createState(player)
    // Make fencing also unoccupied
    const fencingSpace = state.actionSpaces.find((s) => s.id === 'fencing')!
    fencingSpace.takenBy = []

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('returns nothing when all stage-1 spaces are occupied', () => {
    const player = createPlayer()
    const state = createState(player)
    // Occupy major-improvement too
    const majorSpace = state.actionSpaces.find((s) => s.id === 'major-improvement')!
    majorSpace.takenBy = [{ playerId: 'p2', workerId: '1' }]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).toBeNull()
  })

  it('returns jumpLeaf for sheep-market when it is the only unoccupied space', () => {
    const player = createPlayer()
    const state = createState(player)
    // Make sheep-market unoccupied and major-improvement occupied
    const sheepSpace = state.actionSpaces.find((s) => s.id === 'sheep-market')!
    sheepSpace.takenBy = []
    const majorSpace = state.actionSpaces.find((s) => s.id === 'major-improvement')!
    majorSpace.takenBy = [{ playerId: 'p2', workerId: '1' }]

    const flow = runCardEffectHook(state, player, CARD_ID, 'onStartReturnHome')
    expect(flow).not.toBeNull()
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)
    const leaf = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('place-farmer')
    expect(leaf.actionContext?.targetSpaceId).toBe('sheep-market')
    expect(leaf.actionContext?.workerId).toBeUndefined()
  })
})
