import { describe, expect, it } from 'vitest'
import type { ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'
import * as B137Module from '../B/B137_Wholesaler'
import * as C41Module from '../C/C041_FarmStore'
import * as E142Module from '../E/E142_Smuggler'
import { B137_Wholesaler_impl } from '../B/B137_Wholesaler'
import { C041_FarmStore_impl } from '../C/C041_FarmStore'
import { E142_Smuggler_impl } from '../E/E142_Smuggler'

type ResourceMap = Partial<Resource>
type WholesalerKey = 'vegetableTaken' | 'boarTaken' | 'stoneTaken' | 'cattleTaken'
type SpaceReward = {
  listenerId: string
  spaceId: string
  takenKey: WholesalerKey
  reward: ResourceMap
}
type TradeOption = {
  from: ResourceMap
  to: ResourceMap
}

const resource = (overrides: ResourceMap = {}): Resource => ({
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

const player = (resources: ResourceMap = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: resource(resources),
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
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
})

const state = (owner: PlayerState): GameState => ({
  players: [owner],
  actionSpaces: [],
  round: 1,
} as GameState)

const space = (id: string): ActionSpace => ({
  id,
  nameKey: `test.${id}.name`,
  descriptionKey: `test.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  resources: resource(),
  takenBy: [],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
} as ActionSpace)

const expectPayGain = (flow: ActionFlow, pay: ResourceMap, gain: ResourceMap, sourceCard: string) => {
  expect(flow.type).toBe('seq')
  if (flow.type !== 'seq') return
  expect(flow.children).toEqual([
    { type: 'leaf', actionId: 'pay', params: pay, sourceCard },
    { type: 'leaf', actionId: 'gain', params: gain, sourceCard },
  ])
}

describe('card-local table-driven flows', () => {
  it('B137 Wholesaler exports the action-space reward table used by generated listeners', () => {
    const table = (B137Module as unknown as { SPACE_REWARDS?: readonly SpaceReward[] }).SPACE_REWARDS
    expect(table).toEqual([
      { listenerId: 'B137-wholesaler-after-vegetable-seeds', spaceId: 'vegetable-seeds', takenKey: 'vegetableTaken', reward: { vegetable: 1 } },
      { listenerId: 'B137-wholesaler-after-pig-market', spaceId: 'pig-market', takenKey: 'boarTaken', reward: { boar: 1 } },
      { listenerId: 'B137-wholesaler-after-eastern-quarry', spaceId: 'eastern-quarry', takenKey: 'stoneTaken', reward: { stone: 1 } },
      { listenerId: 'B137-wholesaler-after-cattle-market', spaceId: 'cattle-market', takenKey: 'cattleTaken', reward: { cattle: 1 } },
    ])
    expect(B137_Wholesaler_impl.listeners?.map((listener) => listener.id)).toEqual(table!.map((entry) => entry.listenerId))

    for (const entry of table!) {
      const owner = player()
      owner.cardStates = {
        B137_Wholesaler: {
          extraData: {
            wholesaler: {
              vegetableTaken: false,
              boarTaken: false,
              stoneTaken: false,
              cattleTaken: false,
            },
          },
        },
      }
      const listener = B137_Wholesaler_impl.listeners?.find((candidate) => candidate.id === entry.listenerId)
      const result = listener?.handler({
        state: state(owner),
        player: owner,
        triggerPlayer: owner,
        ownerPlayer: owner,
        effectPlayer: owner,
        space: space(entry.spaceId),
        actionId: 'place-farmer',
        phase: 'after',
        result: { type: 'ok' },
      } as CardListenerContext)
      expect(result?.sourceCard).toBe('B137_Wholesaler')
      expect(result?.flow).toEqual({
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: 'B137_Wholesaler',
            params: {
              kind: 'set-extra-data',
              key: 'wholesaler',
              value: {
                vegetableTaken: false,
                boarTaken: false,
                stoneTaken: false,
                cattleTaken: false,
                [entry.takenKey]: true,
              },
            },
          },
          { type: 'leaf', actionId: 'gain', sourceCard: 'B137_Wholesaler', params: entry.reward },
        ],
      })
    }
  })

  it('C41 FarmStore exports reward options used by its optional pay-gain XOR', () => {
    const table = (C41Module as unknown as { REWARD_OPTIONS?: readonly ResourceMap[] }).REWARD_OPTIONS
    expect(table).toEqual([
      { vegetable: 1 },
      { wood: 1, clay: 1 },
      { wood: 1, stone: 1 },
      { wood: 1, reed: 1 },
      { clay: 1, stone: 1 },
      { clay: 1, reed: 1 },
      { stone: 1, reed: 1 },
    ])

    const owner = player({ food: 1 })
    const flow = C041_FarmStore_impl.effect?.onEndHarvestFeedingPhase?.(state(owner), owner)
    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') return
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(table!.length)
    table!.forEach((reward, index) => {
      expectPayGain(flow.children[index]!, { food: 1 }, reward, 'C041_FarmStore')
    })
  })

  it('E142 Smuggler uses its trade options in two optional exchange stages', () => {
    const table = (E142Module as unknown as { TRADE_OPTIONS?: readonly TradeOption[] }).TRADE_OPTIONS
    expect(table).toEqual([
      { from: { wood: 1 }, to: { grain: 1 } },
      { from: { grain: 1 }, to: { stone: 1 } },
    ])

    const owner = player({ wood: 1 })
    const flow = E142_Smuggler_impl.effect?.onHarvestFeedingPhase?.(state(owner), owner)
    expect(flow?.type).toBe('seq')
    if (flow?.type !== 'seq') return
    expect(flow.children).toHaveLength(2)
    flow.children.forEach((stage) => {
      expect(stage.type).toBe('xor')
      if (stage.type !== 'xor') return
      expect(stage.optional).toBe(true)
      expect(stage.children).toHaveLength(table!.length)
      table!.forEach((trade, index) => {
        expect(stage.children[index]).toMatchObject({
          type: 'leaf',
          actionId: 'exchange',
          sourceCard: 'E142_Smuggler',
          actionContext: {
            directTrade: { ...trade, sourceId: 'E142_Smuggler' },
          },
          effectPreview: {
            kind: 'resourceExchange',
            resourcesPaid: trade.from,
            resourcesGained: trade.to,
          },
        })
      })
    })
  })
})
