import { describe, expect, it } from 'vitest'
import type { ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../contract/types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { A17_ReclamationPlow_impl } from '../A/A17_ReclamationPlow'
import { B137_Wholesaler_impl } from '../B/B137_Wholesaler'
import { B55_MaintenancePremium_impl } from '../B/B55_MaintenancePremium'
import { D156_RetailDealer_impl } from '../D/D156_RetailDealer'
import { D157_PartyOrganizer_impl } from '../D/D157_PartyOrganizer'
import { E51_WhaleOil_impl } from '../E/E51_WhaleOil'
import { E91_PlowBuilder_impl } from '../E/E91_PlowBuilder'

const A17 = 'A17_ReclamationPlow'
const B137 = 'B137_Wholesaler'
const B55 = 'B55_MaintenancePremium'
const D156 = 'D156_RetailDealer'
const D157 = 'D157_PartyOrganizer'
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
