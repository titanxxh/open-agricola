import { ActionHookRegistry } from '../../hooks'
import { beforeEach as beforeEachActionHooks } from 'vitest'

let actionHooks: ActionHookRegistry
beforeEachActionHooks(() => { actionHooks = new ActionHookRegistry() })
import { installOfficialCardRegistry } from '../../../cards/__tests__/card-environment'

installOfficialCardRegistry()

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
import { getAvailableStableSupplyCount, getOwnOrdinaryFenceReserveCount } from '../../../domain/supply-tokens'
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
  houseAnimals: {},
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
  actionHooks,
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
  it.each([
    { houseType: 'wood', cost: { wood: 5, reed: 2 } },
    { houseType: 'clay', cost: { clay: 5, reed: 2 } },
    { houseType: 'stone', cost: { stone: 5, reed: 2 } },
  ] satisfies Array<{ houseType: PlayerState['houseType']; cost: Partial<Resource> }>)('records the builder, farm owner and $houseType room material', ({ houseType, cost }) => {
    const events: DraftGameEvent[] = []
    const builder = player({ houseType, resources: resources(cost) })
    const other = player({ id: 'p2' })
    const otherBefore = structuredClone(other)
    const result = constructAction.resolveChoice!(context('construct', builder, events, {
      players: [builder, other],
    }), 'confirm', { rooms: [{ row: 0, col: 0 }] })

    expect(result.type).toBe('ok')
    expect(builder.rooms).toBe(3)
    expect(builder.roomTiles).toEqual([{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 0, col: 0 }])
    expect(other).toEqual(otherBefore)
    expect(events).toContainEqual({
      type: 'farm.roomBuilt', actorPlayerId: 'p1', targetPlayerId: 'p1',
      newlyUsedTiles: [{ playerId: 'p1', row: 0, col: 0 }],
      rooms: [{ playerId: 'p1', row: 0, col: 0, type: houseType }],
    })
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual(cost)
    expect(result.farmOperations).toEqual([expect.objectContaining({
      kind: 'rooms', playerId: 'p1', roomType: houseType,
      positions: [{ row: 0, col: 0 }],
    })])
  })

  it('records stable construction on its farm owner without spending another player\'s pieces', () => {
    const events: DraftGameEvent[] = []
    const builder = player({ resources: resources({ wood: 2 }) })
    const other = player({ id: 'p2' })
    const otherBefore = structuredClone(other)
    const ctx = context('stables', builder, events, { players: [builder, other] })

    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [{ row: 0, col: 0 }] })

    expect(result.type).toBe('ok')
    expect(builder.stableTiles).toEqual([{ row: 0, col: 0 }])
    expect(getAvailableStableSupplyCount(ctx.state, builder)).toBe(3)
    expect(other).toEqual(otherBefore)
    expect(events).toContainEqual({
      type: 'farm.stableBuilt', actorPlayerId: 'p1', targetPlayerId: 'p1',
      sourceActionId: 'stables',
      newlyUsedTiles: [{ playerId: 'p1', row: 0, col: 0 }],
      stables: [{ playerId: 'p1', row: 0, col: 0, kind: 'normal' }],
    })
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 2 })
    expect(result.farmOperations).toEqual([expect.objectContaining({
      kind: 'stables', playerId: 'p1', positions: [{ row: 0, col: 0 }],
    })])
  })

  it('records fence construction and enclosed geometry on its farm owner', () => {
    const events: DraftGameEvent[] = []
    const builder = player({ resources: resources({ wood: 4 }) })
    const other = player({ id: 'p2' })
    const otherBefore = structuredClone(other)
    const edges = edgesForTile(0, 0)

    const result = fenceAction.resolveChoice!(context('fence', builder, events, {
      players: [builder, other],
    }), 'confirm', { edges, palisadeEdges: [] })

    expect(result.type).toBe('ok')
    expect(getOwnOrdinaryFenceReserveCount(builder)).toBe(11)
    expect(builder.pastures).toEqual([expect.objectContaining({ tiles: [{ row: 0, col: 0 }] })])
    expect(other).toEqual(otherBefore)
    const built = events.find(event => event.type === 'farm.fenceBuilt')
    expect(built).toMatchObject({
      type: 'farm.fenceBuilt', actorPlayerId: 'p1', targetPlayerId: 'p1',
      newFenceEdges: edges,
      newlyUsedTiles: [{ playerId: 'p1', row: 0, col: 0 }],
      newlyEnclosedPastureTiles: [{ playerId: 'p1', row: 0, col: 0 }],
    })
    if (result.type !== 'ok' || built?.type !== 'farm.fenceBuilt') return
    expect(result.resourcesPaid).toEqual({ wood: 4 })
    expect(result.farmOperations).toEqual([expect.objectContaining({
      kind: 'fence', playerId: 'p1', positions: [{ row: 0, col: 0 }],
    })])
    expect(result.internalChildren?.beforeHostListeners?.[0]).toMatchObject({
      actionId: 'pay', params: { paymentId: built.paymentId },
    })
  })

  it('records a target farm\'s clay room instead of the builder\'s wood house', () => {
    const events: DraftGameEvent[] = []
    const builder = player({ resources: resources({ clay: 6, reed: 3 }) })
    const farmOwner = player({ id: 'p2', houseType: 'clay' })
    const builderRoomsBefore = structuredClone(builder.roomTiles)
    const ctx = {
      ...context('construct', builder, events, { players: [builder, farmOwner] }),
      actionContext: { targetFarmPlayerId: 'p2' },
    }

    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [{ row: 0, col: 0 }] })

    expect(result.type).toBe('ok')
    expect(result.resourcesPaid).toEqual({ clay: 6, reed: 3 })
    expect(builder.rooms).toBe(2)
    expect(builder.roomTiles).toEqual(builderRoomsBefore)
    expect(farmOwner.rooms).toBe(3)
    expect(farmOwner.roomTiles).toEqual([{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 0, col: 0 }])
    expect(farmOwner.resources).toEqual(resources())
    expect(events).toContainEqual({
      type: 'farm.roomBuilt', actorPlayerId: 'p1', targetPlayerId: 'p2',
      newlyUsedTiles: [{ playerId: 'p2', row: 0, col: 0 }],
      rooms: [{ playerId: 'p2', row: 0, col: 0, type: 'clay' }],
    })
  })

  it.each([
    { action: stablesAction, payload: { stables: [{ row: 0, col: 0 }] }, eventType: 'farm.stableBuilt' },
    { action: fenceAction, payload: { edges: edgesForTile(0, 0), palisadeEdges: [] }, eventType: 'farm.fenceBuilt' },
  ])('commits $eventType to the target farm while retaining the builder as actor', ({ action, payload, eventType }) => {
    const events: DraftGameEvent[] = []
    const builder = player({ resources: resources({ wood: 20 }) })
    const farmOwner = player({ id: 'p2' })
    const builderBefore = structuredClone(builder)
    const ctx = {
      ...context(action.id, builder, events, { players: [builder, farmOwner] }),
      actionContext: { targetFarmPlayerId: 'p2' },
    }

    const result = action.resolveChoice!(ctx, 'confirm', payload)

    expect(result.type).toBe('ok')
    expect(builder).toEqual(builderBefore)
    expect(farmOwner.resources).toEqual(resources())
    expect(events).toContainEqual(expect.objectContaining({
      type: eventType, actorPlayerId: 'p1', targetPlayerId: 'p2',
      newlyUsedTiles: [{ playerId: 'p2', row: 0, col: 0 }],
    }))
    if (result.type !== 'ok') return
    expect(result.farmOperations).toEqual([expect.objectContaining({ playerId: 'p2' })])
    if (eventType === 'farm.stableBuilt') {
      expect(farmOwner.stableTiles).toEqual([{ row: 0, col: 0 }])
      expect(getAvailableStableSupplyCount(ctx.state, farmOwner)).toBe(3)
    } else {
      expect(getOwnOrdinaryFenceReserveCount(farmOwner)).toBe(11)
      expect(farmOwner.pastures).toEqual([expect.objectContaining({ tiles: [{ row: 0, col: 0 }] })])
    }
  })

  it.each([constructAction, stablesAction, fenceAction])('rejects an unavailable target farm before $id changes any player', action => {
    const events: DraftGameEvent[] = []
    const builder = player({ resources: resources({ wood: 20, reed: 2 }) })
    const other = player({ id: 'p2' })
    const ctx = {
      ...context(action.id, builder, events, { players: [builder, other] }),
      actionContext: { targetFarmPlayerId: 'missing-player' },
    }
    const before = structuredClone(ctx.state.players)

    expect(action.execute(ctx).type).toBe('fail')
    expect(action.resolveChoice!(ctx, 'confirm', {
      rooms: [{ row: 0, col: 0 }], stables: [{ row: 0, col: 0 }],
      edges: edgesForTile(0, 0), palisadeEdges: [],
    }).type).toBe('fail')
    expect(ctx.state.players).toEqual(before)
    expect(events).toEqual([])
  })

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
      actionHooks,
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
      actionHooks,
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
      actionHooks,
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
