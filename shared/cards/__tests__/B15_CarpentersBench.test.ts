import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'

import '../B/B015_CarpentersBench'

const CARD_ID = 'B015_CarpentersBench'

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
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
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
    round: 3, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const woodMoved = (
  wood: number,
  playerId = 'p1',
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { wood },
  from: { kind: 'actionSpace', spaceId: 'forest' },
  to: { kind: 'player', playerId },
  reason: 'collect',
})

describe('B015_CarpentersBench', () => {
  it('triggers after collecting wood from a wood space with a paid wood budget', () => {
    const listener = findListener('B15-carpenters-bench-after-collect')
    expect(listener).toBeDefined()
    const player = createPlayer()
    const state = createState(player)
    const woodSpace = createSpace('forest', { gainPerRound: { wood: 3 } })

    const result = executeCardListener(listener!, {
      state,
      player,
      space: woodSpace,
      actionId: 'collect',
      phase: 'after',
      // Actually-collected wood (the reference L42-46 counts wood meeples on space) is
      // the source of truth for bench cap, not space.gainPerRound.
      result: { type: 'ok', resourcesGained: { wood: 3 } },
      transactionEvents: [woodMoved(3, player.id)],
      actionEvents: [woodMoved(3, player.id)],
    })
    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    const reserveLeaf = flow.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(reserveLeaf).toMatchObject({
      actionId: 'reserve-fence-bonus',
      sourceCard: CARD_ID,
      params: { freeFences: 1, counterKey: 'benchFreeFences' },
    })
    const fenceLeaf = flow.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(fenceLeaf.actionId).toBe('fence')
    expect(fenceLeaf.sourceCard).toBe(CARD_ID)
    expect(fenceLeaf.actionContext).toMatchObject({
      trueAction: false,
      fencePolicy: {
        allowedSegmentTypes: ['fence'],
        segmentBounds: { total: { min: 1 } },
        newPastureBounds: { count: { min: 1, max: 1 } },
        costPolicy: { fence: { wood: 1 } },
        paymentBudget: { wood: 3 },
        cancelPolicy: 'forbidCancel',
        promptHintKey: 'ui.interactionCarpentersBenchFenceHint',
      },
    })
    const policy = fenceLeaf.actionContext?.fencePolicy as {
      segmentBounds?: { total?: { max?: number } }
    }
    expect(policy.segmentBounds?.total?.max).toBeUndefined()
  })

  it('uses actually-collected wood, not gainPerRound', () => {
    const listener = findListener('B15-carpenters-bench-after-collect')
    const player = createPlayer()
    const state = createState(player)
    // Space declares wood:3 per round, but the player only got 1 wood this
    // particular collect (e.g. due to other accumulations consumed earlier).
    const woodSpace = createSpace('forest', { gainPerRound: { wood: 3 } })

    const result = executeCardListener(listener!, {
      state,
      player,
      space: woodSpace,
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { wood: 1 } },
      transactionEvents: [woodMoved(1, player.id)],
      actionEvents: [woodMoved(1, player.id)],
    })
    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    const fenceLeaf = flow.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(fenceLeaf.actionContext).toMatchObject({
      fencePolicy: {
        paymentBudget: { wood: 1 },
      },
    })
  })

  it('does not trigger when no wood was actually collected', () => {
    const listener = findListener('B15-carpenters-bench-after-collect')
    const player = createPlayer()
    const state = createState(player)
    const woodSpace = createSpace('forest', { gainPerRound: { wood: 3 } })

    const result = executeCardListener(listener!, {
      state,
      player,
      space: woodSpace,
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: {} },
    })
    expect(result).toBeUndefined()
  })

  it('does not trigger for non-wood accumulation spaces', () => {
    const listener = findListener('B15-carpenters-bench-after-collect')
    const player = createPlayer()
    const state = createState(player)
    const claySpace = createSpace('clay-pit', { gainPerRound: { clay: 1 } })

    const result = executeCardListener(listener!, {
      state,
      player,
      space: claySpace,
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { clay: 1 } },
    })
    expect(result).toBeUndefined()
  })

})
