import { describe, expect, it } from 'vitest'
import type { ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../contract/types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { A130_MummysBoy_impl } from '../A/A130_MummysBoy'
import { A17_ReclamationPlow_impl } from '../A/A17_ReclamationPlow'
import { B124_Trimmer_impl } from '../B/B124_Trimmer'
import { B132_EstateMaster_impl } from '../B/B132_EstateMaster'
import { B137_Wholesaler_impl } from '../B/B137_Wholesaler'
import { B21_HayloftBarn_impl } from '../B/B21_HayloftBarn'
import { B55_MaintenancePremium_impl } from '../B/B55_MaintenancePremium'
import { D156_RetailDealer_impl } from '../D/D156_RetailDealer'
import { D157_PartyOrganizer_impl } from '../D/D157_PartyOrganizer'
import { E27_PiggyBank_impl } from '../E/E27_PiggyBank'
import { E51_WhaleOil_impl } from '../E/E51_WhaleOil'
import { E91_PlowBuilder_impl } from '../E/E91_PlowBuilder'

const A130 = 'A130_MummysBoy'
const A17 = 'A17_ReclamationPlow'
const B124 = 'B124_Trimmer'
const B132 = 'B132_EstateMaster'
const B137 = 'B137_Wholesaler'
const B21 = 'B21_HayloftBarn'
const B55 = 'B55_MaintenancePremium'
const D156 = 'D156_RetailDealer'
const D157 = 'D157_PartyOrganizer'
const E27 = 'E27_PiggyBank'
const E51 = 'E51_WhaleOil'
const E91 = 'E91_PlowBuilder'

type LeafFlow = Extract<ActionFlow, { type: 'leaf' }>
type ExpectedLeaf = Pick<LeafFlow, 'actionId' | 'sourceCard' | 'params'>

const resource = (overrides: Partial<Resource> = {}): Resource => ({
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

const player = (
  cardId: string,
  overrides: Partial<PlayerState> = {},
): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: resource(),
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [cardId],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: {
    placedFarmers: 0,
    firstPlayerCount: 0,
    totalRoomsBuilt: 0,
    totalMajorBuilt: 0,
    totalMinorBuilt: 0,
    totalOccupationBuilt: 0,
    harvestedGrain: 0,
    harvestedVegetable: 0,
    resourcesFromBoard: {},
    resourcesFromCards: {},
    resourcesConverted: {},
    foodFromConversion: {},
    draftHistory: [],
    draftDiscarded: [],
  },
  ...overrides,
})

const space = (
  id: string,
  overrides: Partial<ActionSpace> = {},
): ActionSpace => ({
  id,
  nameKey: `test.${id}.name`,
  descriptionKey: `test.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  resources: resource(),
  takenBy: [],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  ...overrides,
} as ActionSpace)

const context = (
  owner: PlayerState,
  overrides: Partial<CardListenerContext> = {},
): CardListenerContext => ({
  state: {
    players: [owner],
    actionSpaces: [],
    round: 1,
  } as GameState,
  player: owner,
  triggerPlayer: owner,
  ownerPlayer: owner,
  effectPlayer: owner,
  space: space('test-space'),
  actionId: 'place-farmer',
  phase: 'after',
  result: { type: 'ok' },
  ...overrides,
})

const snapshot = (p: PlayerState) => JSON.stringify(p.cardStates)

const listenerById = (
  listeners: readonly CardListenerRegistration[] | undefined,
  id: string,
): CardListenerRegistration => {
  const listener = listeners?.find((entry) => entry.id === id)
  expect(listener, `listener ${id}`).toBeDefined()
  return listener!
}

const leafSummary = (leaf: LeafFlow): ExpectedLeaf => ({
  actionId: leaf.actionId,
  sourceCard: leaf.sourceCard,
  params: leaf.params,
})

const expectSeqLeaves = (flow: ActionFlow | undefined, expected: ExpectedLeaf[]) => {
  expect(flow?.type).toBe('seq')
  if (flow?.type !== 'seq') return
  expect(
    flow.children.map((child, index) => {
      if (child.type !== 'leaf') {
        throw new Error(`Expected seq child ${index} to be leaf, received ${child.type}`)
      }
      return leafSummary(child)
    }),
  ).toEqual(expected)
}

const expectLeaf = (flow: ActionFlow | undefined, expected: ExpectedLeaf) => {
  expect(flow?.type).toBe('leaf')
  if (flow?.type !== 'leaf') return
  expect(leafSummary(flow)).toEqual(expected)
}

const expectCardStatesUnchanged = (
  p: PlayerState,
  before: string,
  label: string,
) => {
  expect({
    playerId: p.id,
    label,
    cardStates: snapshot(p),
  }).toEqual({
    playerId: p.id,
    label,
    cardStates: before,
  })
}

describe('listener purity wave 2a', () => {
  it('B21 HayloftBarn grain-gain listener returns state-update leaves before reward flow without mutating cardStates', () => {
    const p = player(B21, {
      cardStates: { [B21]: { extraData: { foodCount: 1 }, infobox: '1 Food' } },
      workers: [
        { id: '1', isActive: true, isNewborn: false },
        { id: '2', isActive: true, isNewborn: false },
        { id: '3', isActive: false, isNewborn: false },
      ],
    })
    const ctx = context(p, {
      actionId: 'gain',
      result: { type: 'ok', resourcesGained: { grain: 1 } },
      transactionEvents: [{
        type: 'resource.moved',
        resources: { grain: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: p.id },
        reason: 'gain',
      }],
    })
    const before = snapshot(p)

    const result = listenerById(
      B21_HayloftBarn_impl.listeners,
      'B21-hayloft-barn-after-grain-gain',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'B21 owner')
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type !== 'seq') return
    expect(result.flow.children).toHaveLength(3)
    expect(leafSummary(result.flow.children[0] as LeafFlow)).toEqual({
      actionId: 'special-effect',
      sourceCard: B21,
      params: { kind: 'set-extra-data', key: 'foodCount', value: 0 },
    })
    expect(leafSummary(result.flow.children[1] as LeafFlow)).toEqual({
      actionId: 'special-effect',
      sourceCard: B21,
      params: { kind: 'set-infobox', text: 'Empty' },
    })
    const rewardFlow = result.flow.children[2]
    expect(rewardFlow?.type).toBe('seq')
    if (rewardFlow?.type !== 'seq') return
    expect(
      rewardFlow.children.map((child) => {
        expect(child.type).toBe('leaf')
        return leafSummary(child as LeafFlow)
      }),
    ).toEqual([
      { actionId: 'gain', sourceCard: B21, params: { food: 1 } },
      { actionId: 'family-growth', sourceCard: B21, params: undefined },
    ])
    expect((rewardFlow.children[1] as LeafFlow).actionContext).toEqual({ skipRoomCheck: true })
  })

  it('B21 HayloftBarn falls back to transactionEvents when actionEvents is absent', () => {
    const p = player(B21, {
      cardStates: { [B21]: { extraData: { foodCount: 2 }, infobox: '2 Food' } },
      workers: [
        { id: '1', isActive: true, isNewborn: false },
        { id: '2', isActive: true, isNewborn: false },
      ],
    })
    const ctx = context(p, {
      actionId: 'gain',
      result: { type: 'ok', resourcesGained: { grain: 1 } },
      transactionEvents: [{
        type: 'resource.moved',
        resources: { grain: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: p.id },
        reason: 'gain',
      }],
    })

    const result = listenerById(
      B21_HayloftBarn_impl.listeners,
      'B21-hayloft-barn-after-grain-gain',
    ).handler(ctx)

    expect(result?.flow?.type).toBe('seq')
  })

  it('B21 HayloftBarn ignores stale transaction grain when current actionEvents have no grain', () => {
    const p = player(B21, {
      cardStates: { [B21]: { extraData: { foodCount: 2 }, infobox: '2 Food' } },
      workers: [
        { id: '1', isActive: true, isNewborn: false },
        { id: '2', isActive: true, isNewborn: false },
      ],
    })
    const ctx = context(p, {
      actionId: 'gain',
      result: { type: 'ok', resourcesGained: { food: 1 } },
      transactionEvents: [{
        type: 'resource.moved',
        resources: { grain: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: p.id },
        reason: 'gain',
      }],
      actionEvents: [{
        type: 'resource.moved',
        resources: { food: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: p.id },
        reason: 'gain',
      }],
    })
    const before = snapshot(p)

    const result = listenerById(
      B21_HayloftBarn_impl.listeners,
      'B21-hayloft-barn-after-grain-gain',
    ).handler(ctx)

    expect(result).toBeUndefined()
    expectCardStatesUnchanged(p, before, 'B21 owner')
  })

  it('A130 MummysBoy after-place-farmer listener returns flag leaf without mutating cardStates', () => {
    const p = player(A130, {
      occupationPlayed: [A130],
      minorPlayed: [],
      workers: [
        { id: '1', isActive: true, isNewborn: false },
        { id: '2', isActive: true, isNewborn: false },
        { id: '3', isActive: true, isNewborn: false },
      ],
      cardStates: {
        [A130]: {},
        __roundPlacement__: {
          extraData: {
            placements: [
              { spaceId: 'forest', workerId: '1' },
              { spaceId: 'clay-pit', workerId: '2' },
            ],
          },
        },
      },
    })
    const targetSpace = space('clay-pit', {
      takenBy: [
        { playerId: p.id, workerId: '2' },
        { playerId: p.id, workerId: '3' },
      ],
    })
    const ctx = context(p, {
      state: {
        players: [p],
        actionSpaces: [
          space('forest', { takenBy: [{ playerId: p.id, workerId: '1' }] }),
          targetSpace,
        ],
        round: 1,
      } as GameState,
      actionId: 'place-farmer',
      space: targetSpace,
    })
    const before = snapshot(p)

    const result = listenerById(
      A130_MummysBoy_impl.listeners,
      'A130-mummys-boy-after-place-farmer',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'A130 owner')
    expectSeqLeaves(result?.flow, [
      {
        actionId: 'special-effect',
        sourceCard: A130,
        params: { kind: 'set-flag', flag: true },
      },
    ])
  })

  it('E27 PiggyBank update-infobox listener returns infobox leaf without mutating cardStates', () => {
    const p = player(E27, {
      cardStates: { [E27]: { counters: { food: 4 }, infobox: 'stale' } },
    })
    const ctx = context(p, { actionId: 'store-on-card' })
    const before = snapshot(p)

    const result = listenerById(
      E27_PiggyBank_impl.listeners,
      'E27-piggy-bank-after-store',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'E27 owner')
    expectLeaf(result?.flow, {
      actionId: 'special-effect',
      sourceCard: E27,
      params: { kind: 'set-infobox', text: '4 / 6' },
    })
  })

  it('B124 Trimmer after-fencing listener returns state-update leaves before optional gain without mutating cardStates', () => {
    const p = player(B124, {
      cardStates: { [B124]: { extraData: { pastureArea: 1 }, flagged: false } },
      pastures: [
        {
          id: 'p1',
          size: 3,
          tiles: [
            { row: 0, col: 0 },
            { row: 0, col: 1 },
            { row: 0, col: 2 },
          ],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })
    const ctx = context(p, { actionId: 'fencing' })
    const before = snapshot(p)

    const result = listenerById(
      B124_Trimmer_impl.listeners,
      'B124-trimmer-after-fencing',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'B124 owner')
    expectSeqLeaves(result?.flow, [
      {
        actionId: 'special-effect',
        sourceCard: B124,
        params: { kind: 'set-extra-data', key: 'pastureArea', value: 3 },
      },
      {
        actionId: 'special-effect',
        sourceCard: B124,
        params: { kind: 'set-flag', flag: true },
      },
      { actionId: 'gain', sourceCard: B124, params: { stone: 2 } },
    ])
  })

  it('B132 EstateMaster saturation listener returns saturated leaf without mutating cardStates', () => {
    const p = player(B132, {
      cardStates: { [B132]: { extraData: { saturated: false } } },
      roomTiles: Array.from({ length: 15 }, (_, index) => ({
        row: Math.floor(index / 5),
        col: index % 5,
      })),
    })
    const ctx = context(p, { actionId: 'construct', phase: 'immediatelyAfter' })
    const before = snapshot(p)

    const result = listenerById(
      B132_EstateMaster_impl.listeners,
      'B132-saturate-after-construct',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'B132 owner')
    expectLeaf(result?.flow, {
      actionId: 'special-effect',
      sourceCard: B132,
      params: { kind: 'set-extra-data', key: 'saturated', value: true },
    })
  })

  it('B132 EstateMaster reap listener returns bonusVp increment leaf without mutating cardStates', () => {
    const p = player(B132, {
      cardStates: { [B132]: { extraData: { saturated: true }, counters: { bonusVp: 1 } } },
    })
    const ctx = context(p, {
      actionId: 'reap',
      phase: 'immediatelyAfter',
      extraData: { crop: 'vegetable', amount: 2 },
    })
    const before = snapshot(p)

    const result = listenerById(
      B132_EstateMaster_impl.listeners,
      'B132-estate-master-reap',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'B132 owner')
    expectLeaf(result?.flow, {
      actionId: 'special-effect',
      sourceCard: B132,
      params: { kind: 'increment-counter', key: 'bonusVp', amount: 2 },
    })
  })

  it('B137 Wholesaler vegetable listener returns state-write leaf before gain without mutating cardStates', () => {
    const p = player(B137, {
      occupationPlayed: [B137],
      minorPlayed: [],
      cardStates: {
        [B137]: {
          extraData: {
            wholesaler: {
              vegetableTaken: false,
              boarTaken: false,
              stoneTaken: false,
              cattleTaken: false,
            },
          },
        },
      },
    })
    const ctx = context(p, { space: space('vegetable-seeds') })
    const before = snapshot(p)

    const result = listenerById(
      B137_Wholesaler_impl.listeners,
      'B137-wholesaler-after-vegetable-seeds',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'B137 owner')
    expectSeqLeaves(result?.flow, [
      {
        actionId: 'special-effect',
        sourceCard: B137,
        params: {
          kind: 'set-extra-data',
          key: 'wholesaler',
          value: {
            vegetableTaken: true,
            boarTaken: false,
            stoneTaken: false,
            cattleTaken: false,
          },
        },
      },
      { actionId: 'gain', sourceCard: B137, params: { vegetable: 1 } },
    ])
  })

  it('B55 MaintenancePremium wood listener returns food-count leaves before gain without mutating cardStates', () => {
    const p = player(B55, {
      cardStates: { [B55]: { extraData: { foodCount: 3 }, infobox: '3 Food' } },
    })
    const ctx = context(p, {
      actionId: 'collect',
      space: space('forest', { gainPerRound: { wood: 3 } }),
      result: { type: 'ok', resourcesGained: { wood: 3 } },
    })
    const before = snapshot(p)

    const result = listenerById(
      B55_MaintenancePremium_impl.listeners,
      'B55-maintenance-premium-after-collect-wood',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'B55 owner')
    expectSeqLeaves(result?.flow, [
      {
        actionId: 'special-effect',
        sourceCard: B55,
        params: { kind: 'set-extra-data', key: 'foodCount', value: 2 },
      },
      {
        actionId: 'special-effect',
        sourceCard: B55,
        params: { kind: 'set-infobox', text: '2 Food' },
      },
      { actionId: 'gain', sourceCard: B55, params: { food: 1 } },
    ])
  })

  it('D156 RetailDealer resource-market listener returns remaining leaf before gain without mutating cardStates', () => {
    const p = player(D156, {
      occupationPlayed: [D156],
      minorPlayed: [],
      cardStates: { [D156]: { extraData: { remaining: 2 } } },
    })
    const ctx = context(p, { space: space('resource-market-4') })
    const before = snapshot(p)

    const result = listenerById(
      D156_RetailDealer_impl.listeners,
      'D156-retail-dealer-after-place-farmer',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'D156 owner')
    expectSeqLeaves(result?.flow, [
      {
        actionId: 'special-effect',
        sourceCard: D156,
        params: { kind: 'set-extra-data', key: 'remaining', value: 1 },
      },
      { actionId: 'gain', sourceCard: D156, params: { grain: 1, food: 1 } },
    ])
  })

  it('D157 PartyOrganizer family-growth listener returns flag leaf before owner gain without mutating cardStates', () => {
    const owner = player(D157, {
      id: 'owner',
      occupationPlayed: [D157],
      minorPlayed: [],
      cardStates: { [D157]: {} },
    })
    const triggerPlayer = player('__trigger__', {
      id: 'trigger',
      name: 'Trigger',
      color: 'blue',
      minorPlayed: [],
      cardStates: {},
      workers: Array.from({ length: 5 }, (_, index) => ({
        id: String(index + 1),
        isActive: true,
        isNewborn: false,
      })),
    })
    const ctx = context(owner, {
      state: {
        players: [owner, triggerPlayer],
        actionSpaces: [],
        round: 1,
      } as GameState,
      player: triggerPlayer,
      triggerPlayer,
      ownerPlayer: owner,
      effectPlayer: owner,
      actionId: 'family-growth',
      space: space('family-growth'),
    })
    const beforeOwner = snapshot(owner)
    const beforeTrigger = snapshot(triggerPlayer)

    const result = listenerById(
      D157_PartyOrganizer_impl.listeners,
      'D157-after-opponent-family-growth',
    ).handler(ctx)

    expectCardStatesUnchanged(owner, beforeOwner, 'D157 owner')
    expectCardStatesUnchanged(triggerPlayer, beforeTrigger, 'D157 trigger')
    expectSeqLeaves(result?.flow, [
      {
        actionId: 'special-effect',
        sourceCard: D157,
        params: { kind: 'set-flag', flag: true },
      },
      { actionId: 'gain', sourceCard: D157, params: { food: 8 } },
    ])
  })

  it('E51 WhaleOil fishing listener returns increment leaves without mutating cardStates', () => {
    const p = player(E51, {
      cardStates: { [E51]: { extraData: { foodCount: 1 }, infobox: '1 Food' } },
    })
    const ctx = context(p, {
      actionId: 'collect',
      space: space('fishing', { gainPerRound: { food: 1 } }),
      result: { type: 'ok', resourcesGained: { food: 3 } },
    })
    const before = snapshot(p)

    const result = listenerById(
      E51_WhaleOil_impl.listeners,
      'E51-whale-oil-after-collect-fishing',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'E51 owner')
    expectSeqLeaves(result?.flow, [
      {
        actionId: 'special-effect',
        sourceCard: E51,
        params: { kind: 'set-extra-data', key: 'foodCount', value: 2 },
      },
      {
        actionId: 'special-effect',
        sourceCard: E51,
        params: { kind: 'set-infobox', text: '2 Food' },
      },
    ])
  })

  it('E51 WhaleOil occupation listener returns reset leaves before gain without mutating cardStates', () => {
    const p = player(E51, {
      cardStates: { [E51]: { extraData: { foodCount: 1 }, infobox: '1 Food' } },
    })
    const ctx = context(p, {
      actionId: 'play-occupation',
      phase: 'before',
      space: space('lessons'),
    })
    const before = snapshot(p)

    const result = listenerById(
      E51_WhaleOil_impl.listeners,
      'E51-whale-oil-before-occupation',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'E51 owner')
    expectSeqLeaves(result?.flow, [
      {
        actionId: 'special-effect',
        sourceCard: E51,
        params: { kind: 'set-extra-data', key: 'foodCount', value: 0 },
      },
      {
        actionId: 'special-effect',
        sourceCard: E51,
        params: { kind: 'set-infobox', text: '0 Food' },
      },
      { actionId: 'gain', sourceCard: E51, params: { food: 1 } },
    ])
  })

  it('E91 PlowBuilder trade-applied listener returns usedJoinery leaf without mutating cardStates', () => {
    const p = player(E91, {
      occupationPlayed: [E91],
      minorPlayed: [],
      improvements: ['Major_Joinery'],
      cardStates: { [E91]: { extraData: { usedJoinery: false } } },
    })
    const ctx = context(p, {
      actionId: 'trade-applied',
      phase: 'immediatelyAfter',
      extraData: { sourceId: 'Major_Joinery' },
    })
    const before = snapshot(p)

    const result = listenerById(
      E91_PlowBuilder_impl.listeners,
      'E91-plow-builder-trade-applied',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'E91 owner')
    expectLeaf(result?.flow, {
      actionId: 'special-effect',
      sourceCard: E91,
      params: { kind: 'set-extra-data', key: 'usedJoinery', value: true },
    })
  })

  it('A17 ReclamationPlow after-plow listener returns flag and infobox leaves without mutating cardStates', () => {
    const p = player(A17, {
      cardStates: { [A17]: {} },
    })
    const ctx = context(p, {
      actionId: 'plow',
      sourceCard: A17,
      space: space('farmland'),
    })
    const before = snapshot(p)

    const result = listenerById(
      A17_ReclamationPlow_impl.listeners,
      'A17-reclamation-plow-after-plow',
    ).handler(ctx)

    expectCardStatesUnchanged(p, before, 'A17 owner')
    expectSeqLeaves(result?.flow, [
      {
        actionId: 'special-effect',
        sourceCard: A17,
        params: { kind: 'set-flag', flag: true },
      },
      {
        actionId: 'special-effect',
        sourceCard: A17,
        params: { kind: 'set-infobox', text: '✓' },
      },
    ])
  })
})
