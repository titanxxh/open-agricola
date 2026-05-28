import { describe, expect, it } from 'vitest'
import { sowAction } from '../sow'
import { plowAction } from '../plow'
import { constructAction } from '../construct'
import { stablesAction } from '../stables'
import { fenceAction } from '../fencing'
import { familyGrowthAction } from '../family-growth'
import { reap } from '../reap'
import { breedAction } from '../breed'
import { reorganizeAction } from '../reorganize'
import { placeFarmerAction } from '../place-farmer'
import { setFirstPlayerAction } from '../first-player'
import { renovateHouseAction } from '../renovation'
import type {
  ActionMutationContext,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
} from '../../../contract/types'
import type { DraftGameEvent, EventSink } from '../../../contract/events'

const resources = (overrides: Partial<Resource> = {}): Resource => ({
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
  ...overrides,
})

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: resources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
  ],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  occupations: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fences: 0,
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  ...overrides,
} as PlayerState)

const space = (id: string): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: resources(),
  takenBy: [],
} as ActionSpace)

const sink = (events: DraftGameEvent[]): EventSink => ({
  emit: (event) => {
    events.push(event)
  },
  emitMany: (nextEvents) => {
    events.push(...nextEvents)
  },
})

const context = (
  actionId: string,
  p: PlayerState,
  events: DraftGameEvent[],
  state: Partial<GameState> = {},
): ActionMutationContext => ({
  state: {
    players: [p],
    actionSpaces: [space(actionId)],
    currentPlayerIndex: 0,
    log: [],
    ...state,
  } as GameState,
  player: p,
  space: space(actionId),
  eventSink: sink(events),
})

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('farm action events', () => {
  it('emits farm events for sow, plow, construct, stables, and fencing', () => {
    const sowEvents: DraftGameEvent[] = []
    const sowPlayer = player({
      resources: resources({ grain: 1 }),
      fields: [{ row: 0, col: 0, stacks: [] }],
    })
    expect(sowAction.resolveChoice!(context('sow', sowPlayer, sowEvents), 'confirm', {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    }).type).toBe('ok')
    expect(sowEvents).toContainEqual(expect.objectContaining({ type: 'farm.sown' }))

    const plowEvents: DraftGameEvent[] = []
    const plowPlayer = player()
    expect(plowAction.resolveChoice!(context('plow', plowPlayer, plowEvents), 'confirm', {
      tile: { row: 0, col: 0 },
    }).type).toBe('ok')
    expect(plowEvents).toContainEqual(expect.objectContaining({ type: 'farm.fieldPlowed' }))

    const constructEvents: DraftGameEvent[] = []
    const constructPlayer = player({ resources: resources({ wood: 5, reed: 2 }) })
    expect(constructAction.resolveChoice!(context('construct', constructPlayer, constructEvents), 'confirm', {
      rooms: [{ row: 0, col: 0 }],
    }).type).toBe('ok')
    expect(constructEvents).toContainEqual(expect.objectContaining({ type: 'farm.roomBuilt' }))

    const stableEvents: DraftGameEvent[] = []
    const stablePlayer = player({ resources: resources({ wood: 2 }) })
    expect(stablesAction.resolveChoice!(context('stables', stablePlayer, stableEvents), 'confirm', {
      stables: [{ row: 0, col: 0 }],
    }).type).toBe('ok')
    expect(stableEvents).toContainEqual(expect.objectContaining({ type: 'farm.stableBuilt' }))

    const fenceEvents: DraftGameEvent[] = []
    const fencePlayer = player({ resources: resources({ wood: 4 }) })
    expect(fenceAction.resolveChoice!(context('fencing', fencePlayer, fenceEvents), 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    }).type).toBe('ok')
    expect(fenceEvents).toContainEqual(expect.objectContaining({ type: 'farm.fenceBuilt' }))
  })

  it('emits worker, harvest, breed, and reorganize events', () => {
    const workerEvents: DraftGameEvent[] = []
    const familyPlayer = player()
    expect(familyGrowthAction.execute({
      ...context('family-growth', familyPlayer, workerEvents),
      actionContext: { skipRoomCheck: true },
    }).type).toBe('ok')
    expect(workerEvents).toContainEqual(expect.objectContaining({
      type: 'worker.placed',
      workerId: '3',
      spaceId: 'family-growth',
    }))

    const reapEvents: DraftGameEvent[] = []
    const reapPlayer = player({
      resources: resources(),
      fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }],
    })
    expect(reap({ players: [reapPlayer], actionSpaces: [] } as GameState, reapPlayer, sink(reapEvents)).type).toBe('ok')
    expect(reapEvents).toContainEqual(expect.objectContaining({
      type: 'farm.cropRemoved',
      reason: 'reap',
      trigger: { phase: 'harvest' },
    }))
    expect(reapEvents).toContainEqual(expect.objectContaining({
      type: 'resource.moved',
      reason: 'reap',
      trigger: { phase: 'harvest' },
    }))

    const breedEvents: DraftGameEvent[] = []
    const breedPlayer = player({
      resources: resources({ sheep: 2 }),
      pastures: [{
        id: 'pasture-1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      }],
    })
    expect(breedAction.execute({
      ...context('breed', breedPlayer, breedEvents),
      actionContext: { sourceCard: 'harvest' },
    }).type).toBe('ok')
    expect(breedEvents).toContainEqual(expect.objectContaining({
      type: 'farm.animalBred',
      animals: { sheep: 1 },
      source: 'harvest',
    }))

    const reorgEvents: DraftGameEvent[] = []
    const reorgPlayer = player({
      resources: resources({ sheep: 3 }),
      pastures: [{
        id: 'pasture-1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      }],
    })
    expect(reorganizeAction.resolveChoice!(
      context('reorganize', reorgPlayer, reorgEvents),
      'confirm',
      [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 }],
    ).type).toBe('ok')
    expect(reorgEvents).toContainEqual(expect.objectContaining({ type: 'farm.animalMoved' }))
    expect(reorgEvents).toContainEqual(expect.objectContaining({
      type: 'farm.animalDiscarded',
      animals: { sheep: 2 },
      reason: 'noRoom',
    }))
  })

  it('emits events for place-farmer, first-player, and renovation completion', () => {
    const placeEvents: DraftGameEvent[] = []
    const placePlayer = player()
    const placeState = {
      players: [placePlayer],
      actionSpaces: [space('forest')],
      currentPlayerIndex: 0,
      log: [],
    } as GameState
    expect(placeFarmerAction.resolveChoice!({
      state: placeState,
      player: placePlayer,
      space: placeState.actionSpaces[0]!,
      eventSink: sink(placeEvents),
    }, 'forest').type).toBe('flow')
    expect(placeEvents).toContainEqual(expect.objectContaining({
      type: 'worker.placed',
      workerId: '1',
      spaceId: 'forest',
    }))

    const firstPlayerEvents: DraftGameEvent[] = []
    const firstPlayer = player({ id: 'p2' })
    expect(setFirstPlayerAction.execute({
      state: {
        players: [player({ id: 'p1', startPlayer: true }), firstPlayer],
        actionSpaces: [],
        currentPlayerIndex: 1,
        log: [],
      } as GameState,
      player: firstPlayer,
      space: space('set-first-player'),
      eventSink: sink(firstPlayerEvents),
    }).type).toBe('ok')
    expect(firstPlayerEvents).toContainEqual(expect.objectContaining({
      type: 'startPlayer.changed',
      playerId: 'p2',
    }))

    const renovateEvents: DraftGameEvent[] = []
    const renovatePlayer = player({ houseType: 'wood' })
    const renovationResult = {
      type: 'ok' as const,
      extraData: {
        renovation: {
          from: 'wood' as const,
          to: 'clay' as const,
          rooms: renovatePlayer.roomTiles.map(({ row, col }) => ({ row, col })),
        },
      },
    }
    expect(renovateHouseAction.completeInternalChildren!({
      state: { players: [renovatePlayer], actionSpaces: [], log: [] } as GameState,
      player: renovatePlayer,
      space: space('renovate-house'),
      eventSink: sink(renovateEvents),
    }, renovationResult, {}).type).toBe('ok')
    expect(renovateEvents).toContainEqual(expect.objectContaining({
      type: 'farm.renovated',
      playerId: 'p1',
      from: 'wood',
      to: 'clay',
    }))
  })
})
