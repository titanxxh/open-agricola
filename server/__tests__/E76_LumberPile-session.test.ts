import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { runSelectionEffect } from '../../shared/actions/helpers/selection-effect-registry'
import type { GameState, PlayerState , ActionFlow } from '../../shared/game/types'

import '../../shared/cards/E/E76_LumberPile'

const CARD_ID = 'E76_LumberPile'
const FIELD_EFFECT = 'lumber-pile-return-stables'

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
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('E76_LumberPile card effect', () => {
  it('onBuy returns undefined when the player has no stables', () => {
    const player = createPlayer('p1')
    player.stableTiles = []
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBuy offers an optional selection with max 3 stables', () => {
    const player = createPlayer('p1')
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 },
      { row: 1, col: 0 }, { row: 1, col: 1 },
    ]
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player) as Extract<ActionFlow, { type: 'seq' }>
    expect(flow).toBeDefined()
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    const leaf = flow.children[0]
    expect(leaf.actionId).toBe('selection')
    expect(leaf.actionContext.selectionEffect).toBe(FIELD_EFFECT)
    expect(leaf.actionContext.selectionKind).toBe('farm-position')
    expect(leaf.actionContext.maxSelections).toBe(3)
    expect(leaf.actionContext.selectableTiles.length).toBe(4)
  })

  it('selection-effect removes up to 3 stables and grants 3 wood each', () => {
    const player = createPlayer('p1')
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 },
      { row: 1, col: 0 }, { row: 1, col: 1 },
    ]
    const initialWood = player.resources.wood
    runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: ['0-0', '0-1', '1-0'],
      sourceCard: CARD_ID,
    })
    expect(player.stableTiles).toHaveLength(1)
    expect(player.stableTiles[0]).toEqual({ row: 1, col: 1 })
    expect(player.resources.wood).toBe(initialWood + 9)
  })

  it('selection-effect caps at 3 stables even if more are selected', () => {
    const player = createPlayer('p1')
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 },
      { row: 1, col: 0 }, { row: 1, col: 1 },
    ]
    const initialWood = player.resources.wood
    runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: ['0-0', '0-1', '1-0', '1-1'],
      sourceCard: CARD_ID,
    })
    expect(player.stableTiles).toHaveLength(1)
    expect(player.resources.wood).toBe(initialWood + 9)
  })

  it('selection-effect awards nothing when no stables are selected', () => {
    const player = createPlayer('p1')
    player.stableTiles = [{ row: 0, col: 0 }]
    const initialWood = player.resources.wood
    runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: [],
      sourceCard: CARD_ID,
    })
    expect(player.stableTiles).toHaveLength(1)
    expect(player.resources.wood).toBe(initialWood)
  })

  it('lists the B85 FarmHand tile alongside normal stables and returns it for 3 wood', () => {
    const player = createPlayer('p1')
    player.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    player.cardStates = {
      B85_FarmHand: {
        flagged: true,
        extraData: { position: { row: 3, col: 2 } },
      },
    }
    const state = createState([player])
    const flow = getCardEffect(CARD_ID)!.onBuy!(state, player) as Extract<ActionFlow, { type: 'seq' }>
    const leaf = flow.children[0]
    expect(leaf.actionContext.selectableTiles).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 3, col: 2 },
    ])

    const initialWood = player.resources.wood
    runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: ['0-0', '3-2', '0-1'],
      sourceCard: CARD_ID,
    })
    expect(player.resources.wood).toBe(initialWood + 9)
    expect(player.stableTiles).toEqual([])
    expect(player.cardStates!.B85_FarmHand!.extraData?.position).toBeUndefined()
    // once-per-game flag persists so B85 cannot be re-used.
    expect(player.cardStates!.B85_FarmHand!.flagged).toBe(true)
  })
})
