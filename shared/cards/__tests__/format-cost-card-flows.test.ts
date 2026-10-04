import { describe, expect, it } from 'vitest'
import { executeCardListener, getRegisteredCardListeners } from '../card-listeners'
import { getCardEffect, runCardEffectHook } from '../card-effects'
import type { ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'

import '../A/A013_RenovationCompany'
import '../A/A015_CarpentersAxe'
import '../A/A085_Homekeeper'
import '../A/A118_Treegardener'
import '../B/B002_MiniPasture'
import '../B/B016_MiningHammer'
import '../B/B049_Scales'
import '../B/B088_EstablishedPerson'
import '../B/B089_Groom'
import '../B/B093_Confidant'
import '../B/B149_OpenAirFarmer'
import '../C/C002_Stable'
import '../C/C089_StableMaster'
import '../C/C094_StableCleaner'
import '../C/C149_ResourceRecycler'
import '../D/D016_WoodenWheyBucket'
import '../D/D042_EducationBonus'
import '../D/D089_Stablehand'
import '../D/D149_CasualWorker'
import '../E/E001_PoleBarns'
import '../E/E002_RenovationMaterials'
import '../E/E088_MasterFencer'
import '../E/E089_Stallwright'
import '../E/E097_Beneficiary'

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
  it('A013_RenovationCompany emits a free optional renovation through exactCost', () => {
    const actor = player({ houseType: 'wood', rooms: 2 })
    const gameState = state(actor)
    const flow = getCardEffect('A013_RenovationCompany')!.onBuy!(gameState, actor)
    const leaf = expectLeaf(flow, 'renovate-house')
    expect(leaf.optional).toBe(true)
    expect(leaf.actionContext).toEqual({ exactCost: {} })
    expectNoLegacyCostFields(leaf)
  })

  it('A015_CarpentersAxe emits one stable at exact 1 wood', () => {
    const actor = player({
      resources: resources({ wood: 7 }),
      minorPlayed: ['A015_CarpentersAxe'],
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

  it('B016_MiningHammer emits one free stable after renovation', () => {
    const actor = player({ minorPlayed: ['B016_MiningHammer'] })
    const gameState = state(actor)
    const result = executeCardListener(listener('B16-mining-hammer-after-renovate'), context(gameState, actor, {
      actionId: 'renovate-house',
      phase: 'after',
    }))
    const leaf = expectLeaf(result?.flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { max: 1 } })
    expectNoLegacyCostFields(leaf)
  })

  it('B088_EstablishedPerson emits free renovation and ordinary fence action without upfront pay', () => {
    const actor = player({
      houseType: 'wood',
      rooms: 2,
      occupationPlayed: ['B088_EstablishedPerson'],
    })
    const gameState = state(actor)
    const flow = getCardEffect('B088_EstablishedPerson')!.onBuy!(gameState, actor)
    const renovation = expectLeaf(flow, 'renovate-house')
    expect(renovation.actionContext).toEqual({ exactCost: {} })
    expectNoLegacyCostFields(renovation)
    expectLeaf(flow, 'fence')
    expect(findLeaves(flow, 'pay')).toEqual([])
  })

  it('B089_Groom emits one stable at exact 1 wood', () => {
    const actor = player({
      houseType: 'stone',
      occupationPlayed: ['B089_Groom'],
    })
    const gameState = state(actor)
    const flow = runCardEffectHook(gameState, actor, 'B089_Groom', 'onBeforeStartOfTurn')
    const leaf = expectLeaf(flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { wood: 1, max: 1 } })
    expectNoLegacyCostFields(leaf)
  })

  it('C089_StableMaster emits one stable at exact 1 wood', () => {
    const actor = player({
      resources: resources({ wood: 1 }),
      occupationPlayed: ['C089_StableMaster'],
    })
    const gameState = state(actor)
    const flow = runCardEffectHook(gameState, actor, 'C089_StableMaster', 'onBuy')
    const leaf = expectLeaf(flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { wood: 1 }, trueAction: false })
    expectNoLegacyCostFields(leaf)
  })

  it('C094_StableCleaner emits stables at exact 1 wood and 1 food', () => {
    const actor = player({
      resources: resources({ wood: 1, food: 1 }),
      occupationPlayed: ['C094_StableCleaner'],
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

  it('D089_Stablehand emits one free stable after new pasture fencing', () => {
    const actor = player({ occupationPlayed: ['D089_Stablehand'] })
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

  it('C002_Stable emits one free stable from actionContext', () => {
    const actor = player()
    const gameState = state(actor)
    const flow = getCardEffect('C002_Stable')!.onBuy!(gameState, actor)
    const leaf = expectLeaf(flow, 'stables')
    expect(leaf.params).toBeUndefined()
    expect(leaf.actionContext).toMatchObject({
      max: 1,
      exactCost: { wood: 0, max: 1 },
      cancelPolicy: 'forbidCancel',
    })
    expectNoLegacyCostFields(leaf)
  })

  it('E001_PoleBarns emits up to three free stables from actionContext', () => {
    const actor = player()
    const gameState = state(actor)
    const flow = getCardEffect('E001_PoleBarns')!.onBuy!(gameState, actor)
    const leaf = expectLeaf(flow, 'stables')
    expect(leaf.params).toBeUndefined()
    expect(leaf.actionContext).toMatchObject({ max: 3, exactCost: { wood: 0, max: 3 } })
    expectNoLegacyCostFields(leaf)
  })

  it('B002_MiniPasture emits free fence policy directly to fence action', () => {
    const actor = player()
    const gameState = state(actor)
    const flow = getCardEffect('B002_MiniPasture')!.onBuy!(gameState, actor)
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

  it('D016_WoodenWheyBucket emits exactly one stable at the sheep/cattle market costs', () => {
    const actor = player({ minorPlayed: ['D016_WoodenWheyBucket'] })
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

  it('E002_RenovationMaterials emits a free clay renovation through exactCost', () => {
    const actor = player({ houseType: 'wood' })
    const gameState = state(actor)
    const flow = getCardEffect('E002_RenovationMaterials')!.onBuy!(gameState, actor)
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

  it('E088_MasterFencer emits free capped fence policies for both options', () => {
    const actor = player({
      houseType: 'stone',
      resources: resources({ wood: 3 }),
      occupationPlayed: ['E088_MasterFencer'],
    })
    const gameState = state(actor)
    const flow = getCardEffect('E088_MasterFencer')!.onRoundStart!(gameState, actor)
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

  it('E089_Stallwright emits one free stable on configured occupation count', () => {
    const actor = player({
      occupationPlayed: ['E089_Stallwright', 'A085_Homekeeper'],
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

  it('E089_Stallwright still offers the third-occupation stable when Beneficiary bonus is skipped', () => {
    const actor = player({
      occupationPlayed: ['E089_Stallwright', 'A085_Homekeeper', 'E097_Beneficiary'],
    })
    const gameState = state(actor)
    const result = executeCardListener(listener('E89-stallwright-after-occupation'), context(gameState, actor, {
      actionId: 'occupation',
      phase: 'after',
      space: gameState.actionSpaces.find((entry) => entry.id === 'occupation')!,
      transactionEvents: [{
        type: 'card.played',
        cardId: 'E097_Beneficiary',
        cardType: 'occupation',
      }],
    }))
    const leaf = expectLeaf(result?.flow, 'stables')
    expect(leaf.actionContext).toMatchObject({ max: 1, exactCost: { max: 1 }, trueAction: false })
  })

  it('E089_Stallwright does not duplicate when Beneficiary already played the extra occupation branch', () => {
    const actor = player({
      occupationPlayed: ['E089_Stallwright', 'A085_Homekeeper', 'E097_Beneficiary', 'A114_SeasonalWorker'],
    })
    const gameState = state(actor)
    const result = executeCardListener(listener('E89-stallwright-after-occupation'), context(gameState, actor, {
      actionId: 'occupation',
      phase: 'after',
      space: gameState.actionSpaces.find((entry) => entry.id === 'occupation')!,
      transactionEvents: [{
        type: 'card.played',
        cardId: 'E097_Beneficiary',
        cardType: 'occupation',
      }, {
        type: 'card.played',
        cardId: 'A114_SeasonalWorker',
        cardType: 'occupation',
      }],
    }))
    expect(result).toBeUndefined()
  })

  it('E097_Beneficiary emits one-food occupation without embedding Stallwright', () => {
    const actor = player({
      occupationPlayed: ['E089_Stallwright', 'A001_OtherOccupation', 'E097_Beneficiary'],
      occupationHand: ['A114_SeasonalWorker'],
    })
    const gameState = state(actor)
    const flow = getCardEffect('E097_Beneficiary')!.onBuy!(gameState, actor)
    expect(flow?.type).toBe('or')
    if (flow?.type !== 'or') return
    const occupationBranch = flow.children[0]
    expect(occupationBranch?.type).toBe('seq')
    if (occupationBranch?.type !== 'seq') return
    expect(occupationBranch.children[0]).toMatchObject({
      type: 'leaf',
      actionId: 'occupation-gate',
    })
    expect(occupationBranch.children[1]).toMatchObject({
      type: 'leaf',
      actionId: 'occupation',
      params: { exactCost: { food: 1 } },
    })
    const occupation = expectLeaf(flow, 'occupation')
    expect(occupation.params).toEqual({ exactCost: { food: 1 } })
  })

  it('B093_Confidant offers future receive sow/fence with explicit fence cost policy', () => {
    const actor = player({ occupationPlayed: ['B093_Confidant'] })
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
      cardId: 'B093_Confidant',
      sourceCardId: 'B093_Confidant',
      resources: { food: 1 },
    })

    const flow = getCardEffect('B093_Confidant')!.onRoundStart!(gameState, actor)
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
