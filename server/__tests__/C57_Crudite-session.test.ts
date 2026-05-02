import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../shared/game/types'

import '../../shared/cards/C/C57_Crudite'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C57_Crudite'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
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
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('C57_Crudite', () => {
  it('onBuy offers pay 3 food for 1 vegetable when player has food', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.resources.food = 5
    const state = createState(player)

    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0].actionId).toBe('pay-resources')
    expect(children[0].params).toEqual({ food: 3 })
    expect(children[1].actionId).toBe('gain')
    expect(children[1].params).toEqual({ vegetable: 1 })
  })

  it('onBuy returns undefined when player has < 3 food', () => {
    const effect = getCardEffect(CARD_ID)

    const player = createPlayer()
    player.resources.food = 2
    const state = createState(player)

    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onStartHarvestFieldPhase removes 1 veg from field and gains 4 food', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 3 }] },
    ]
    const state = createState(player)

    const flow = effect!.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 4 })
    // Field should have 1 less vegetable
    expect(player.fields[0]!.stacks[0]?.remaining ?? 0).toBe(2)
  })

  it('onStartHarvestFieldPhase returns undefined when no qualifying field', () => {
    const effect = getCardEffect(CARD_ID)

    const player = createPlayer()
    // Only 1 vegetable (need >= 2)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    const state = createState(player)

    const flow = effect!.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('anytime listener returns SEQ(remove-field-crop, gain 4 food) when qualifying veg field exists', () => {
    // BGA: anytime route runs `actEatFieldVeg` which deletes the field veg
    // and inserts gainNode([FOOD => 4]). We mirror via SEQ of:
    //   special-effect remove-field-crop (decrements top vegetable stack)
    //   gain food:4
    const listener = findListener('C57-crudite-anytime')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player,
      actionId: '', phase: 'anytime',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children.length).toBe(2)
    const seLeaf = children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(seLeaf.actionId).toBe('special-effect')
    expect(seLeaf.params?.kind).toBe('remove-field-crop')
    const gainLeafChild = children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(gainLeafChild.actionId).toBe('gain')
    expect(gainLeafChild.params).toEqual({ food: 4 })
    // Field is NOT modified by listener handler (side-effect-free).
    // The mutation happens when the engine actually executes the SE leaf.
    expect(player.fields[0]!.stacks[0]?.remaining ?? 0).toBe(2)
  })

  it('anytime listener returns undefined without qualifying field', () => {
    const listener = findListener('C57-crudite-anytime')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.fields = [] // No fields
    const state = createState(player)

    const result = executeCardListener(listener!, {
      state, player,
      actionId: '', phase: 'anytime',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
