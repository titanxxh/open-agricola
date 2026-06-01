import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import type { ActionFlow, GameState, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/E/E125_DelayedWayfarer'

const CARD_ID = 'E125_DelayedWayfarer'

const createPlayer = (
  id = 'p1',
  overrides: Partial<PlayerState> = {},
): PlayerState =>
  ({
    id,
    name: id,
    color: 'red',
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
    rooms: 2,
    houseType: 'wood' as const,
    fields: [],
    fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [CARD_ID],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

const createState = (round: number, players: PlayerState[]): GameState =>
  ({
    round,
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('E125_DelayedWayfarer card effect', () => {
  describe('onBuy', () => {
    it('returns XOR building-resource choice and records playedRound', () => {
      const player = createPlayer('p1')
      const state = createState(3, [player])
      const effect = getCardEffect(CARD_ID)
      expect(effect).toBeDefined()
      const flow = effect!.onBuy!(state, player)
      expect(flow).toBeDefined()
      expect((flow as Extract<ActionFlow, { type: 'leaf' }>).type).toBe('xor')
      expect((flow as Extract<ActionFlow, { type: 'seq' }>).children).toHaveLength(4)
      const gains = (flow as Extract<ActionFlow, { type: 'seq' }>).children.map((c: ActionFlow) => c.params)
      expect(gains).toEqual(
        expect.arrayContaining([
          { wood: 1 },
          { clay: 1 },
          { reed: 1 },
          { stone: 1 },
        ]),
      )
      expect(readCardExtraData<number>(player, CARD_ID, 'playedRound')).toBe(3)
    })
  })

  describe('onAllWorkersPlaced', () => {
    it('offers optional place-farmer when playedRound matches and supply farmer exists', () => {
      const player = createPlayer('p1')
      const state = createState(5, [player])
      player.cardStates[CARD_ID] = { extraData: { playedRound: 5 } }
      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onAllWorkersPlaced!(state, player)
      expect(flow).toBeDefined()
      expect((flow as Extract<ActionFlow, { type: 'leaf' }>).type).toBe('seq')
      expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
      expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0].actionId).toBe('place-farmer')
      expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0].sourceCard).toBe(CARD_ID)
      expect((flow as Extract<ActionFlow, { type: 'seq' }>).children[0].actionContext).toEqual({
        trueAction: false,
        extraPlacement: true,
        fromSupply: true,
      })
    })

    it('clears playedRound after triggering', () => {
      const player = createPlayer('p1')
      const state = createState(5, [player])
      player.cardStates[CARD_ID] = { extraData: { playedRound: 5 } }
      const effect = getCardEffect(CARD_ID)
      effect!.onAllWorkersPlaced!(state, player)
      expect(readCardExtraData<number>(player, CARD_ID, 'playedRound')).toBe(-1)
    })

    it('does nothing when playedRound does not match current round', () => {
      const player = createPlayer('p1')
      const state = createState(5, [player])
      player.cardStates[CARD_ID] = { extraData: { playedRound: 3 } }
      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onAllWorkersPlaced!(state, player)
      expect(flow).toBeUndefined()
    })

    it('does nothing when no supply farmer exists (all workers active)', () => {
      const player = createPlayer('p1', {
        workers: [
          { id: '1', isActive: true, isNewborn: false },
          { id: '2', isActive: true, isNewborn: false },
          { id: '3', isActive: true, isNewborn: false },
          { id: '4', isActive: true, isNewborn: false },
          { id: '5', isActive: true, isNewborn: false },
        ] as any,
      })
      const state = createState(5, [player])
      player.cardStates[CARD_ID] = { extraData: { playedRound: 5 } }
      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onAllWorkersPlaced!(state, player)
      expect(flow).toBeUndefined()
    })

    it('does nothing when inactive supply farmers were removed from supply', () => {
      const player = createPlayer('p1', {
        workers: [
          { id: '1', isActive: true, isNewborn: false },
          { id: '2', isActive: true, isNewborn: false },
          { id: '3', isActive: false, isNewborn: false, removedFromSupply: true },
          { id: '4', isActive: false, isNewborn: false, removedFromSupply: true },
          { id: '5', isActive: false, isNewborn: false, removedFromSupply: true },
        ] as any,
      })
      const state = createState(5, [player])
      player.cardStates[CARD_ID] = { extraData: { playedRound: 5 } }
      const effect = getCardEffect(CARD_ID)
      const flow = effect!.onAllWorkersPlaced!(state, player)
      expect(flow).toBeUndefined()
      expect(readCardExtraData<number>(player, CARD_ID, 'playedRound')).toBe(5)
    })


    it('does not trigger twice in the same round (flag cleared to -1)', () => {
      const player = createPlayer('p1')
      const state = createState(5, [player])
      player.cardStates[CARD_ID] = { extraData: { playedRound: 5 } }
      const effect = getCardEffect(CARD_ID)
      expect(effect!.onAllWorkersPlaced!(state, player)).toBeDefined()
      expect(effect!.onAllWorkersPlaced!(state, player)).toBeUndefined()
    })
  })
})
