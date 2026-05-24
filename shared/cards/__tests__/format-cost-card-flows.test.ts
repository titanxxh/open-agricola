import { describe, expect, it } from 'vitest'
import { executeCardListener, getRegisteredCardListeners } from '../card-listeners'
import { getCardEffect, runCardEffectHook } from '../card-effects'
import type { ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'

import '../A/A13_RenovationCompany'
import '../A/A15_CarpentersAxe'
import '../A/A89_StablePlanner'
import '../B/B2_MiniPasture'
import '../B/B16_MiningHammer'
import '../B/B88_EstablishedPerson'
import '../B/B89_Groom'
import '../B/B93_Confidant'
import '../B/B149_OpenAirFarmer'
import '../C/C2_Stable'
import '../C/C89_StableMaster'
import '../C/C94_StableCleaner'
import '../C/C149_ResourceRecycler'
import '../D/D16_WoodenWheyBucket'
import '../D/D89_Stablehand'
import '../D/D149_CasualWorker'
import '../E/E1_PoleBarns'
import '../E/E2_RenovationMaterials'
import '../E/E88_MasterFencer'
import '../E/E89_Stallwright'
import '../E/E97_Beneficiary'

type ListenerContextInput = Parameters<typeof executeCardListener>[1]
type LeafFlow = Extract<ActionFlow, { type: 'leaf' }>

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

const player = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: resources(),
    workers: [],
    rooms: 2,
    roomTiles: [
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ],
    stableTiles: [],
    fields: [],
    pastures: [],
    fenceSegments: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    activeModifiers: [],
    cardStates: {},
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    ...overrides,
  }) as unknown as PlayerState

const space = (
  id: string,
  overrides: Partial<ActionSpace> = {},
): ActionSpace =>
  ({
    id,
    type: id,
    position: 0,
    players: [],
    available: true,
    gainPerRound: {},
    ...overrides,
  }) as unknown as ActionSpace

const state = (...players: PlayerState[]): GameState =>
  ({
    round: 1,
    phase: 'playing',
    roundPhase: 'work',
    draft: null,
    currentPlayerIndex: 0,
    players,
    actionSpaces: [
      space('forest', { gainPerRound: { wood: 1 } }),
      space('eastern-quarry'),
      space('house-redevelopment'),
      space('occupation'),
      space('fencing'),
    ],
    log: [],
    events: [],
    nextEventSeq: 1,
    publicEventArchive: [],
    nextPublicEventArchivePacketSeq: 1,
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    enableCommunityDeck: false,
    workPhaseObtainedResources: {},
    completedFeedingPhases: 0,
  }) as unknown as GameState

const listener = (id: string) => {
  const found = getRegisteredCardListeners().find((entry) => entry.id === id)
  expect(found).toBeDefined()
  return found!
}

const findLeaf = (
  flow: ActionFlow | undefined,
  actionId: string,
): LeafFlow | undefined => {
  if (!flow) return undefined
  if (flow.type === 'leaf') return flow.actionId === actionId ? flow : undefined
  for (const child of flow.children) {
    const found = findLeaf(child, actionId)
    if (found) return found
  }
  return undefined
}

const findLeaves = (
  flow: ActionFlow | undefined,
  actionId: string,
): LeafFlow[] => {
  if (!flow) return []
  if (flow.type === 'leaf') return flow.actionId === actionId ? [flow] : []
  return flow.children.flatMap((child) => findLeaves(child, actionId))
}

const expectLeaf = (flow: ActionFlow | undefined, actionId: string) => {
  const leaf = findLeaf(flow, actionId)
  expect(leaf).toBeDefined()
  return leaf!
}

const expectNoLegacyCostFields = (leaf: LeafFlow) => {
  expect(leaf.actionContext?.costOverride).toBeUndefined()
  expect(leaf.actionContext?.costs).toBeUndefined()
}

const context = (
  gameState: GameState,
  actor: PlayerState,
  overrides: Partial<ListenerContextInput> = {},
): ListenerContextInput => ({
  state: gameState,
  player: actor,
  space: space('test-space'),
  actionId: 'test',
  phase: 'after',
  transactionEvents: [],
  ...overrides,
} as ListenerContextInput)

const fenceBuilt = (): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  fences: [{ edge: 'H-0-0', type: 'fence' }],
  newFenceEdges: ['H-0-0'],
  newPastures: [{ tiles: [{ row: 0, col: 0 }] }],
})

describe('formatCost migrated card flows', () => {
  it('A13_RenovationCompany emits a free optional renovation through exactCost', () => {
    const actor = player({ houseType: 'wood', rooms: 2 })
    const gameState = state(actor)
    const flow = getCardEffect('A13_RenovationCompany')!.onBuy!(gameState, actor)
    const leaf = expectLeaf(flow, 'renovate-house')
    expect(leaf.optional).toBe(true)
    expect(leaf.actionContext).toEqual({ exactCost: {} })
    expectNoLegacyCostFields(leaf)
  })

  it('A15_CarpentersAxe emits one stable at exact 1 wood', () => {
    const actor = player({
      resources: resources({ wood: 7 }),
      minorPlayed: ['A15_CarpentersAxe'],
    })
    const gameState = state(actor)
    const result = executeCardListener(listener('A15-carpenters-axe-after-collect'), context(gameState, actor, {
      actionId: 'collect',
      phase: 'after',
      space: gameState.actionSpaces.find((entry) => entry.id === 'forest')!,
    }))
    const leaf = expectLeaf(result?.flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { wood: 1, max: 1 } })
    expectNoLegacyCostFields(leaf)
  })

  it('A89_StablePlanner emits one free stable from actionContext', () => {
    const actor = player({ occupationPlayed: ['A89_StablePlanner'] })
    const gameState = state(actor)
    gameState.round = 2
    getCardEffect('A89_StablePlanner')!.onBuy!(gameState, actor)
    gameState.round = 5
    const flow = getCardEffect('A89_StablePlanner')!.onRoundStart!(gameState, actor)
    const leaf = expectLeaf(flow, 'stables')
    expect(leaf.params).toBeUndefined()
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { max: 1 } })
    expectNoLegacyCostFields(leaf)
  })

  it('B16_MiningHammer emits one free stable after renovation', () => {
    const actor = player({ minorPlayed: ['B16_MiningHammer'] })
    const gameState = state(actor)
    const result = executeCardListener(listener('B16-mining-hammer-after-renovate'), context(gameState, actor, {
      actionId: 'renovate-house',
      phase: 'after',
    }))
    const leaf = expectLeaf(result?.flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { max: 1 } })
    expectNoLegacyCostFields(leaf)
  })

  it('B88_EstablishedPerson emits free renovation and ordinary fence action without upfront pay', () => {
    const actor = player({
      houseType: 'wood',
      rooms: 2,
      occupationPlayed: ['B88_EstablishedPerson'],
    })
    const gameState = state(actor)
    const flow = getCardEffect('B88_EstablishedPerson')!.onBuy!(gameState, actor)
    const renovation = expectLeaf(flow, 'renovate-house')
    expect(renovation.actionContext).toEqual({ exactCost: {} })
    expectNoLegacyCostFields(renovation)
    expectLeaf(flow, 'fence')
    expect(findLeaves(flow, 'pay')).toEqual([])
  })

  it('B89_Groom emits one stable at exact 1 wood', () => {
    const actor = player({
      houseType: 'stone',
      occupationPlayed: ['B89_Groom'],
    })
    const gameState = state(actor)
    const flow = runCardEffectHook(gameState, actor, 'B89_Groom', 'onBeforeStartOfTurn')
    const leaf = expectLeaf(flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { wood: 1, max: 1 } })
    expectNoLegacyCostFields(leaf)
  })

  it('C89_StableMaster emits one stable at exact 1 wood', () => {
    const actor = player({
      resources: resources({ wood: 1 }),
      occupationPlayed: ['C89_StableMaster'],
    })
    const gameState = state(actor)
    const flow = runCardEffectHook(gameState, actor, 'C89_StableMaster', 'onBuy')
    const leaf = expectLeaf(flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { wood: 1 }, trueAction: false })
    expectNoLegacyCostFields(leaf)
  })

  it('C94_StableCleaner emits stables at exact 1 wood and 1 food', () => {
    const actor = player({
      resources: resources({ wood: 1, food: 1 }),
      occupationPlayed: ['C94_StableCleaner'],
    })
    const gameState = state(actor)
    const result = executeCardListener(listener('C94-stable-cleaner-anytime'), context(gameState, actor, {
      actionId: 'stables',
      phase: 'anytime',
    }))
    const leaf = expectLeaf(result?.flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ exactCost: { wood: 1, food: 1 }, trueAction: false })
    expectNoLegacyCostFields(leaf)
  })

  it('C149_ResourceRecycler emits one free construct room', () => {
    const owner = player({
      id: 'p1',
      houseType: 'clay',
      occupationPlayed: ['C149_ResourceRecycler'],
    })
    const trigger = player({
      id: 'p2',
      houseType: 'stone',
    })
    const gameState = state(owner, trigger)
    const result = executeCardListener(listener('C149-resource-recycler-opponent-renovate-stone'), context(gameState, trigger, {
      actionId: 'renovate-house',
      phase: 'after',
      space: gameState.actionSpaces.find((entry) => entry.id === 'house-redevelopment')!,
      triggerPlayer: trigger,
      ownerPlayer: owner,
    }), { ownerPlayerId: owner.id })
    const leaf = expectLeaf(result?.flow, 'construct')
    expect(leaf.actionContext).toMatchObject({ maxRooms: 1, exactCost: {}, trueAction: false })
    expectNoLegacyCostFields(leaf)
  })

  it('D89_Stablehand emits one free stable after new pasture fencing', () => {
    const actor = player({ occupationPlayed: ['D89_Stablehand'] })
    const gameState = state(actor)
    const actionEvents = [fenceBuilt()]
    const result = executeCardListener(listener('D89-stablehand-after-fencing'), context(gameState, actor, {
      actionId: 'fence',
      phase: 'after',
      space: gameState.actionSpaces.find((entry) => entry.id === 'fencing')!,
      transactionEvents: actionEvents,
      actionEvents,
    }))
    const leaf = expectLeaf(result?.flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { max: 1 }, trueAction: false })
    expectNoLegacyCostFields(leaf)
  })

  it('D149_CasualWorker emits one free stable option', () => {
    const owner = player({
      id: 'p1',
      occupationPlayed: ['D149_CasualWorker'],
    })
    const trigger = player({ id: 'p2' })
    const gameState = state(owner, trigger)
    const result = executeCardListener(listener('D149-casual-worker-opponent-quarry'), context(gameState, trigger, {
      actionId: 'place-farmer',
      phase: 'after',
      space: gameState.actionSpaces.find((entry) => entry.id === 'eastern-quarry')!,
      ownerPlayer: owner,
      triggerPlayer: trigger,
    }), { ownerPlayerId: owner.id })
    const leaf = expectLeaf(result?.flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { max: 1 } })
    expectNoLegacyCostFields(leaf)
  })

  it('C2_Stable emits one free stable from actionContext', () => {
    const actor = player()
    const gameState = state(actor)
    const flow = getCardEffect('C2_Stable')!.onBuy!(gameState, actor)
    const leaf = expectLeaf(flow, 'stables')
    expect(leaf.params).toBeUndefined()
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { wood: 0, max: 1 } })
    expectNoLegacyCostFields(leaf)
  })

  it('E1_PoleBarns emits up to three free stables from actionContext', () => {
    const actor = player()
    const gameState = state(actor)
    const flow = getCardEffect('E1_PoleBarns')!.onBuy!(gameState, actor)
    const leaf = expectLeaf(flow, 'stables')
    expect(leaf.params).toBeUndefined()
    expect(leaf.actionContext).toMatchObject({ max: 3, exactCost: { wood: 0, max: 3 } })
    expectNoLegacyCostFields(leaf)
  })

  it('B2_MiniPasture emits free fence policy directly to fence action', () => {
    const actor = player()
    const gameState = state(actor)
    const flow = getCardEffect('B2_MiniPasture')!.onBuy!(gameState, actor)
    const leaf = expectLeaf(flow, 'fence')
    expect(leaf.params).toBeUndefined()
    expect(leaf.actionContext).toMatchObject({
      fencePolicy: {
        segmentBounds: { total: { min: 1, max: 4 } },
        newPastureBounds: {
          count: { min: 1, max: 1 },
          totalSize: { min: 1, max: 1 },
        },
        costPolicy: { fence: { wood: 0 } },
      },
    })
  })

  it('D16_WoodenWheyBucket emits exactly one stable at the sheep/cattle market costs', () => {
    const actor = player({ minorPlayed: ['D16_WoodenWheyBucket'] })
    const gameState = state(actor)
    const registration = listener('D16-wooden-whey-bucket-before-place-farmer')

    const sheep = executeCardListener(registration, context(gameState, actor, {
      actionId: 'place-farmer',
      phase: 'before',
      space: space('sheep-market'),
    }))
    const sheepLeaf = expectLeaf(sheep?.flow, 'stables')
    expect(sheepLeaf.params).toBeUndefined()
    expect(sheepLeaf.actionContext).toMatchObject({ max: 1, exactCost: { wood: 1, max: 1 } })

    const cattle = executeCardListener(registration, context(gameState, actor, {
      actionId: 'place-farmer',
      phase: 'before',
      space: space('cattle-market'),
    }))
    const cattleLeaf = expectLeaf(cattle?.flow, 'stables')
    expect(cattleLeaf.params).toBeUndefined()
    expect(cattleLeaf.actionContext).toMatchObject({ max: 1, exactCost: { max: 1 } })
  })

  it('E2_RenovationMaterials emits a free clay renovation through exactCost', () => {
    const actor = player({ houseType: 'wood' })
    const gameState = state(actor)
    const flow = getCardEffect('E2_RenovationMaterials')!.onBuy!(gameState, actor)
    const leaf = expectLeaf(flow, 'renovate-house')
    expect(leaf.params).toEqual({ selectedOption: 'clay' })
    expect(leaf.actionContext).toEqual({ exactCost: {} })
  })

  it('B149_OpenAirFarmer emits free fence policy directly to fence action after upfront cost', () => {
    const actor = player()
    const gameState = state(actor)
    const flow = getCardEffect('B149_OpenAirFarmer')!.onBuy!(gameState, actor)
    const leaf = expectLeaf(flow, 'fence')
    expect(leaf.params).toBeUndefined()
    expect(leaf.actionContext).toMatchObject({
      fencePolicy: {
        segmentBounds: { total: { min: 1, max: 6 } },
        newPastureBounds: {
          count: { min: 1, max: 1 },
          totalSize: { min: 2, max: 2 },
        },
        costPolicy: { fence: { wood: 0 } },
      },
    })
  })

  it('E88_MasterFencer emits free capped fence policies for both options', () => {
    const actor = player({
      houseType: 'stone',
      resources: resources({ wood: 3 }),
      occupationPlayed: ['E88_MasterFencer'],
    })
    const gameState = state(actor)
    const flow = getCardEffect('E88_MasterFencer')!.onRoundStart!(gameState, actor)
    const leaves = findLeaves(flow, 'fence')
    expect(leaves).toHaveLength(2)
    expect(leaves[0]!.params).toBeUndefined()
    expect(leaves[0]!.actionContext).toMatchObject({
      fencePolicy: {
        segmentBounds: { total: { min: 1, max: 3 } },
        costPolicy: { fence: { wood: 0 } },
      },
    })
    expect(leaves[1]!.params).toBeUndefined()
    expect(leaves[1]!.actionContext).toMatchObject({
      fencePolicy: {
        segmentBounds: { total: { min: 1, max: 4 } },
        costPolicy: { fence: { wood: 0 } },
      },
    })
  })

  it('E89_Stallwright emits one free stable on configured occupation count', () => {
    const actor = player({
      occupationPlayed: ['E89_Stallwright', 'A1_OtherOccupation'],
    })
    const gameState = state(actor)
    const result = executeCardListener(listener('E89-stallwright-after-occupation'), context(gameState, actor, {
      actionId: 'occupation',
      phase: 'after',
      space: gameState.actionSpaces.find((entry) => entry.id === 'occupation')!,
    }))
    const leaf = expectLeaf(result?.flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { max: 1 }, trueAction: false })
    expectNoLegacyCostFields(leaf)
  })

  it('E89_Stallwright does not duplicate the Beneficiary third-occupation stable', () => {
    const actor = player({
      occupationPlayed: ['E89_Stallwright', 'A1_OtherOccupation', 'E97_Beneficiary'],
    })
    const gameState = state(actor)
    const result = executeCardListener(listener('E89-stallwright-after-occupation'), context(gameState, actor, {
      actionId: 'occupation',
      phase: 'after',
      space: gameState.actionSpaces.find((entry) => entry.id === 'occupation')!,
      transactionEvents: [{
        type: 'card.played',
        cardId: 'E97_Beneficiary',
        cardType: 'occupation',
      }],
    }))
    expect(result).toBeUndefined()
  })

  it('E97_Beneficiary emits one-food occupation and Stallwright free stable branch', () => {
    const actor = player({
      occupationPlayed: ['E89_Stallwright', 'A1_OtherOccupation', 'E97_Beneficiary'],
      occupationHand: ['A114_SeasonalWorker'],
    })
    const gameState = state(actor)
    const flow = getCardEffect('E97_Beneficiary')!.onBuy!(gameState, actor)
    expect(flow?.type).toBe('or')
    if (flow?.type !== 'or') return
    const occupationBranch = flow.children[0]
    expect(occupationBranch?.type).toBe('seq')
    if (occupationBranch?.type !== 'seq') return
    expect(occupationBranch.children[0]).toMatchObject({
      type: 'leaf',
      actionId: 'occupation',
      params: { exactCost: { food: 1 } },
    })
    const stable = expectLeaf(flow, 'stables')
    expect(stable.optional).toBe(true)
    expect(stable.actionContext).toMatchObject({ max: 1, exactCost: { max: 1 } })
    expectNoLegacyCostFields(stable)
    const occupation = expectLeaf(flow, 'occupation')
    expect(occupation.params).toEqual({ exactCost: { food: 1 } })
  })

  it('B93_Confidant offers future receive sow/fence with explicit fence cost policy', () => {
    const actor = player({ occupationPlayed: ['B93_Confidant'] })
    const gameState = state(actor)
    gameState.round = 4
    gameState.events.push({
      schemaVersion: 1,
      id: 'event-b93',
      seq: 1,
      round: 4,
      phase: 'preWork',
      visibility: 'public',
      type: 'futureMeeple.resolved',
      playerId: actor.id,
      cardId: 'B93_Confidant',
      sourceCardId: 'B93_Confidant',
      resources: { food: 1 },
    })

    const flow = getCardEffect('B93_Confidant')!.onRoundStart!(gameState, actor)
    expect(flow?.type).toBe('seq')
    const sow = expectLeaf(flow, 'sow')
    expect(sow.actionContext).toMatchObject({ trueAction: false })
    const fence = expectLeaf(flow, 'fence')
    expect(fence.actionContext).toMatchObject({
      trueAction: false,
      fencePolicy: { costPolicy: { fence: { wood: 1 } } },
    })
  })
})
