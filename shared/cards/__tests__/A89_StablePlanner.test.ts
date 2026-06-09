import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import { specialEffectAction } from '../../actions/effects/special-effect'
import { futureMeeplesAction } from '../../actions/effects/internal/future-meeples'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'
import type { ActionFlow, ActionSpace, GameState, PlayerState } from '../../contract/types'

import '../A/A89_StablePlanner'

const CARD_ID = 'A89_StablePlanner'

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

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const dummySpace = { id: 'test', type: 'test' } as unknown as ActionSpace

const executeLeaf = (
  flow: ActionFlow,
  state: GameState,
  player: PlayerState,
) => {
  if (flow.type === 'seq') {
    flow.children.forEach((child) => executeLeaf(child, state, player))
    return
  }
  if (flow.type !== 'leaf') return
  if (flow.actionId === 'special-effect') {
    specialEffectAction.execute({
      state,
      player,
      space: dummySpace,
      params: flow.params,
      sourceCard: flow.sourceCard,
      actionContext: flow.actionContext,
      eventSink: undefined as never,
    })
  }
  if (flow.actionId === 'future-meeples') {
    futureMeeplesAction.execute({
      state,
      player,
      space: dummySpace,
      params: flow.params,
      sourceCard: flow.sourceCard,
      actionContext: flow.actionContext,
      eventSink: undefined as never,
    })
  }
}

describe('A89_StablePlanner', () => {
  it('onBuy offers prefix choices at +3, +6, +9 without reserving before acceptance', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 2
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') return
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(3)
    expect(player.cardStates?.[CARD_ID]?.extraData?.targetRounds).toBeUndefined()
  })

  it('caps prefix choices by stable reserve', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 2
    player.supplyTokensConsumed = { stable: 2 }
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') return
    expect(flow.children).toHaveLength(2)
  })

  it('clamps prefix choices to round 14', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 10
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') return
    expect(flow.children).toHaveLength(1)
  })

  it('accepted prefix queues stable future meeples', () => {
    const player = createPlayer()
    const state = createState(player)
    state.round = 2
    const flow = getCardEffect(CARD_ID)!.onBuy!(state, player)
    if (flow?.type !== 'xor') throw new Error('expected xor')

    executeLeaf(flow.children[1]!, state, player)

    expect(player.cardStates?.[CARD_ID]?.extraData?.targetRounds).toBeUndefined()
    expect(state.futureMeeples.map((entry) => entry.round)).toEqual([5, 8])
    expect(state.futureMeeples.map((entry) => entry.resources)).toEqual([
      { stable: 1 },
      { stable: 1 },
    ])
    expect(getAvailableStableSupplyCount(state, player)).toBe(2)
  })

  it('does not expose a card-local onRoundStart flow', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect!.onRoundStart).toBeUndefined()
  })
})
