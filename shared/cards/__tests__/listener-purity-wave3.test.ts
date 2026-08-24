import { describe, expect, it } from 'vitest'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { A043_FarmyardManure_impl } from '../A/A043_FarmyardManure'
import { A045_FireProtectionPond_impl } from '../A/A045_FireProtectionPond'
import { A046_ClawKnife_impl } from '../A/A046_ClawKnife'
import { A074_StableTree_impl } from '../A/A074_StableTree'
import { A167_BreederBuyer_impl } from '../A/A167_BreederBuyer'
import { B043_Chophouse_impl } from '../B/B043_Chophouse'
import { B047_HerringPot_impl } from '../B/B047_HerringPot'
import { B060_BrewingWater_impl } from '../B/B060_BrewingWater'
import { C043_FarmBuilding_impl } from '../C/C043_FarmBuilding'
import { C045_Stew_impl } from '../C/C045_Stew'
import { D111_InteriorDecorator_impl } from '../D/D111_InteriorDecorator'
import { D147_TrapBuilder_impl } from '../D/D147_TrapBuilder'
import { D166_StableMilker_impl } from '../D/D166_StableMilker'
import { E108_BlackberryFarmer_impl } from '../E/E108_BlackberryFarmer'
import { E157_Usufructuary_impl } from '../E/E157_Usufructuary'
import { M059_NaturesFertilizer_impl } from '../M/M059_NaturesFertilizer'

const resources = () => ({
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
})

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: resources(),
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
  stats: {} as PlayerState['stats'],
  ...overrides,
})

const context = (
  p: PlayerState,
  overrides: Partial<CardListenerContext> = {},
): CardListenerContext => ({
  state: {
    players: [p],
    actionSpaces: [],
    round: 4,
    pendingFutureMeeples: [],
    futureMeeples: [],
    roundActionOrder: [],
  } as unknown as GameState,
  player: p,
  triggerPlayer: p,
  ownerPlayer: p,
  effectPlayer: p,
  space: { id: 'test-space' } as CardListenerContext['space'],
  actionId: 'place-farmer',
  phase: 'after',
  result: { type: 'ok' },
  ...overrides,
})

const listener = (
  listeners: readonly CardListenerRegistration[] | undefined,
  id: string,
) => {
  const found = listeners?.find((entry) => entry.id === id)
  expect(found, id).toBeDefined()
  return found!
}

const leaves = (flow: ActionFlow | undefined): Extract<ActionFlow, { type: 'leaf' }>[] => {
  if (!flow) return []
  if (flow.type === 'leaf') return [flow]
  if ('children' in flow) return flow.children.flatMap(leaves)
  return []
}

const invokePure = (
  registration: CardListenerRegistration,
  ctx: CardListenerContext,
) => {
  const before = JSON.stringify(ctx.state)
  const result = registration.handler(ctx)
  expect(JSON.stringify(ctx.state)).toBe(before)
  return result
}

describe('listener purity wave 3', () => {
  it.each([
    [A046_ClawKnife_impl.listeners, 'A46-claw-knife-after-place-farmer', 'sheep-market', undefined, { count: 2, resources: { food: 1 } }],
    [B043_Chophouse_impl.listeners, 'B43-chophouse-after-place-farmer', 'grain-seeds', undefined, { count: 3, resources: { food: 1 } }],
    [B047_HerringPot_impl.listeners, 'B47-herring-pot-after-place-farmer', 'fishing', undefined, { count: 3, resources: { food: 1 } }],
    [C043_FarmBuilding_impl.listeners, 'C43-farm-building-after-improvement', 'test-space', 'major:Major_Fireplace1', { count: 3, resources: { food: 1 } }],
    [C045_Stew_impl.listeners, 'C45-stew-after-place-farmer', 'day-laborer', undefined, { count: 4, resources: { food: 1 } }],
    [D111_InteriorDecorator_impl.listeners, 'D111-interior-decorator-after-renovation', 'test-space', undefined, { count: 6, resources: { food: 1 } }],
  ])('%s returns an inline future-meeples request without mutating', (registrations, id, spaceId, choice, expected) => {
    const p = player()
    const ctx = context(p, {
      space: { id: spaceId } as CardListenerContext['space'],
      choice,
    })
    const result = invokePure(listener(registrations, id), ctx)
    const future = leaves(result?.flow).find((leaf) => leaf.actionId === 'future-meeples')
    expect(future?.params?.__futureMeepleRequest).toMatchObject({
      cardId: expect.any(String),
      playerId: p.id,
      startRound: 5,
      ...expected,
    })
  })

  it('A045 flags before queueing its six-round request', () => {
    const p = player()
    const result = invokePure(
      listener(A045_FireProtectionPond_impl.listeners, 'A45-fire-protection-pond-after-renovation'),
      context(p),
    )
    expect(leaves(result?.flow).map((leaf) => [leaf.actionId, leaf.params])).toEqual([
      ['special-effect', { kind: 'set-flag', flag: true }],
      ['future-meeples', {
        __futureMeepleRequest: {
          cardId: 'A045_FireProtectionPond',
          playerId: p.id,
          startRound: 5,
          count: 6,
          resources: { food: 1 },
        },
      }],
    ])
  })

  it('B060 only queues after the optional grain payment is accepted', () => {
    const p = player({ resources: { ...resources(), grain: 1 } })
    const result = invokePure(
      listener(B060_BrewingWater_impl.listeners, 'B60-brewing-water-after-place-farmer'),
      context(p, { space: { id: 'fishing' } as CardListenerContext['space'] }),
    )
    expect(result?.flow).toMatchObject({ type: 'seq', optional: true })
    expect(leaves(result?.flow).map((leaf) => leaf.actionId)).toEqual(['pay', 'future-meeples'])
    expect(leaves(result?.flow)[1]?.params?.__futureMeepleRequest).toMatchObject({
      cardId: 'B060_BrewingWater',
      count: 6,
    })
  })

  it('D147 returns its three distinct future entries', () => {
    const p = player()
    const result = invokePure(
      listener(D147_TrapBuilder_impl.listeners, 'D147-trap-builder-before-place-farmer'),
      context(p, { space: { id: 'day-laborer' } as CardListenerContext['space'], phase: 'before' }),
    )
    expect(leaves(result?.flow)[0]?.params?.__futureMeepleRequest).toMatchObject({
      cardId: 'D147_TrapBuilder',
      playerId: p.id,
      entries: [
        { round: 5, resources: { food: 1 } },
        { round: 6, resources: { food: 1 } },
        { round: 7, resources: { boar: 1 } },
      ],
    })
  })

  it('E108 derives the queue length from fence events without mutating', () => {
    const p = player()
    const result = invokePure(
      listener(E108_BlackberryFarmer_impl.listeners, 'E108-blackberry-farmer-after-fencing'),
      context(p, {
        actionId: 'fence',
        actionEvents: [{ type: 'farm.fenceBuilt', newFenceEdges: ['a', 'b'] }] as never,
      }),
    )
    expect(leaves(result?.flow)[0]?.params?.__futureMeepleRequest).toMatchObject({ count: 2 })
  })

  it.each([
    [A043_FarmyardManure_impl.listeners, 'A43-farmyard-manure-after-stables', 1, 0, 'food'],
    [A074_StableTree_impl.listeners, 'A74-stable-tree-after-stables', 1, 0, 'wood'],
    [A167_BreederBuyer_impl.listeners, 'A167-breeder-buyer-after-construct', 1, 1, 'sheep'],
    [D166_StableMilker_impl.listeners, 'D166-stable-milker-after-stables', 2, 0, 'cattle'],
  ])('%s writes its action token through a leaf before the reward', (registrations, id, stableCount, roomCount, reward) => {
    const p = player({
      stableTiles: Array.from({ length: stableCount }, (_, col) => ({ row: 0, col })),
      roomTiles: Array.from({ length: roomCount }, (_, col) => ({ row: 1, col })),
      cardStates: { __actionSnapshot__: { extraData: { token: 9, stableTiles: 0, roomTiles: 0 } } },
    })
    const result = invokePure(listener(registrations, id), context(p))
    const resultLeaves = leaves(result?.flow)
    expect(resultLeaves[0]).toMatchObject({
      actionId: 'special-effect',
      params: { kind: 'set-extra-data', key: 'usedActionToken', value: 9 },
    })
    expect(JSON.stringify(resultLeaves.slice(1))).toContain(reward)
  })

  it('E157 uses the trigger snapshot instead of trailing live card counts', () => {
    const p = player({ occupationPlayed: ['E157_Usufructuary', 'A113_HeresyTeacher'] })
    const other = player({ id: 'p2', occupationPlayed: ['A113_HeresyTeacher', 'D166_StableMilker', 'A167_BreederBuyer'] })
    const result = invokePure(
      listener(E157_Usufructuary_impl.listeners, 'E157-usufructuary-after-occupation'),
      context(p, {
        state: { players: [p, other] } as GameState,
        triggerSnapshot: {
          players: {
            p1: { counts: { occupation: 1 } },
            p2: { counts: { occupation: 2 } },
          },
        } as CardListenerContext['triggerSnapshot'],
      }),
    )
    expect(result?.flow).toMatchObject({ actionId: 'gain', params: { food: 2 } })
  })

  it('M059 persists selected positions through a leaf before sowing', () => {
    const p = player({
      resources: { ...resources(), grain: 1 },
      fields: [{ row: 0, col: 0, stacks: [] }],
    })
    const result = invokePure(
      listener(M059_NaturesFertilizer_impl.listeners, 'M059-natures-fertilizer-after-terrain-field'),
      context(p, {
        actionId: 'slash-and-burn',
        extraData: { payload: { tile: { row: 0, col: 0 } } },
      }),
    )
    expect(leaves(result?.flow).map((leaf) => leaf.actionId)).toEqual(['special-effect', 'sow'])
    expect(leaves(result?.flow)[0]?.params).toEqual({
      kind: 'set-extra-data',
      key: 'selectedPositions',
      value: ['0-0'],
    })
  })
})
