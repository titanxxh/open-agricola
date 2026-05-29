import { describe, expect, it } from 'vitest'
import { getCardEffect, getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { runSelectionEffect } from '../../shared/actions/helpers/selection-effect-registry'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import type { GameState, PlayerState , ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/D/D102_SampleStableMaker'
import '../../shared/cards/B/B85_FarmHand'

const CARD_ID = 'D102_SampleStableMaker'
const FIELD_EFFECT = 'sample-stable-maker-return'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
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
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createState = (players: PlayerState[]): GameState =>
  ({
    round: 5, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('D102_SampleStableMaker card effect', () => {
  const createOwner = () => {
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    return player
  }

  it('onStartReturnHome returns undefined when the player has no stables', () => {
    const player = createOwner()
    player.stableTiles = []
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onStartReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })


  it('onStartReturnHome offers optional selection + minor improvement', () => {
    const player = createOwner()
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 1, col: 0 },
    ]
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onStartReturnHome!(state, player) as Extract<ActionFlow, { type: 'seq' }>
    expect(flow).toBeDefined()
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(2)
    expect(flow.children[0].actionId).toBe('selection')
    expect(flow.children[0].actionContext.selectionEffect).toBe(FIELD_EFFECT)
    expect(flow.children[0].actionContext.selectionKind).toBe('farm-position')
    expect(flow.children[0].actionContext.maxSelections).toBe(1)
    expect(flow.children[1].actionId).toBe('improvement')
    expect(flow.children[1].optional).toBe(true)
    expect(flow.children[1].sourceCard).toBe(CARD_ID)
  })

  it('selection-effect removes exactly 1 stable and grants 1 wood, 1 grain, 1 food', () => {
    const player = createOwner()
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 1, col: 0 },
    ]
    const initial = {
      wood: player.resources.wood,
      grain: player.resources.grain,
      food: player.resources.food,
    }
    runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: ['0-0'],
      sourceCard: CARD_ID,
    })
    expect(player.stableTiles).toHaveLength(1)
    expect(player.stableTiles[0]).toEqual({ row: 1, col: 0 })
    expect(player.resources.wood).toBe(initial.wood + 1)
    expect(player.resources.grain).toBe(initial.grain + 1)
    expect(player.resources.food).toBe(initial.food + 1)
  })

  it('selection-effect does nothing when no selection is made', () => {
    const player = createOwner()
    player.stableTiles = [{ row: 0, col: 0 }]
    const initial = {
      wood: player.resources.wood,
      grain: player.resources.grain,
      food: player.resources.food,
    }
    runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: [],
      sourceCard: CARD_ID,
    })
    expect(player.stableTiles).toHaveLength(1)
    expect(player.resources.wood).toBe(initial.wood)
    expect(player.resources.grain).toBe(initial.grain)
    expect(player.resources.food).toBe(initial.food)
  })

  it('offers the B85 FarmHand tile as a selection candidate', () => {
    const player = createOwner()
    player.stableTiles = []
    player.cardStates = {
      B85_FarmHand: { extraData: { position: { row: 2, col: 1 } } },
    }
    const state = createState([player])
    const flow = getCardEffect(CARD_ID)!.onStartReturnHome!(state, player) as Extract<ActionFlow, { type: 'seq' }>
    expect(flow).toBeDefined()
    const selection = flow.children[0]
    expect(selection.actionContext.selectableTiles).toEqual([{ row: 2, col: 1 }])
  })

  it('returns the B85 FarmHand tile and pays the normal resource reward', () => {
    const player = createOwner()
    player.occupationPlayed.push('B85_FarmHand')
    player.stableTiles = []
    player.cardStates = {
      B85_FarmHand: {
        flagged: true,
        extraData: { position: { row: 2, col: 1 } },
      },
    }
    const initial = {
      wood: player.resources.wood,
      grain: player.resources.grain,
      food: player.resources.food,
    }
    expect(getExtraRoomCapacity(player)).toBe(1)
    runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: ['2-1'],
      sourceCard: CARD_ID,
    })
    // FarmHand tile cleared from cardStates, but `flagged` stays true so
    // the player cannot rebuild it.
    expect(player.cardStates!.B85_FarmHand!.extraData?.position).toBeUndefined()
    expect(player.cardStates!.B85_FarmHand!.flagged).toBe(true)
    expect(player.stableTiles).toEqual([])
    expect(getExtraRoomCapacity(player)).toBe(0)
    expect(player.resources.wood).toBe(initial.wood + 1)
    expect(player.resources.grain).toBe(initial.grain + 1)
    expect(player.resources.food).toBe(initial.food + 1)
  })

  it('returning the B85 FarmHand tile releases stable reserve', () => {
    const player = createOwner()
    player.stableTiles = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ]
    player.cardStates = {
      B85_FarmHand: {
        flagged: true,
        extraData: { position: { row: 2, col: 1 } },
      },
    }
    const state = createState([player])
    expect(getAvailableStableSupplyCount(state, player)).toBe(0)

    runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: ['2-1'],
      sourceCard: CARD_ID,
      state,
      cards: [],
    })

    expect(getAvailableStableSupplyCount(state, player)).toBe(1)
  })
})
