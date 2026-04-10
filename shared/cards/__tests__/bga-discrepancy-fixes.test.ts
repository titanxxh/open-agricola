import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

// Import cards to register their effects/listeners
import '../C/C37_DwellingMound'
import '../E/E130_Overachiever'
import '../B/B70_NewPurchase'
import '../A/A84_Silage'
import '../D/D150_GodlySpouse'
import '../D/D152_Patron'
import '../E/E128_Saddler'
import '../E/E57_CheeseFondue'

// Card definition imports
import { C37_DwellingMound } from '../C/C37_DwellingMound'
import { E130_Overachiever } from '../E/E130_Overachiever'
import { A84_Silage } from '../A/A84_Silage'
import { D150_GodlySpouse } from '../D/D150_GodlySpouse'
import { D152_Patron } from '../D/D152_Patron'
import { E128_Saddler } from '../E/E128_Saddler'
import { E57_CheeseFondue } from '../E/E57_CheeseFondue'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, phase: 'work', players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

// === Player count restrictions ===

describe('D150_GodlySpouse — player restriction', () => {
  it('has players set to 4+', () => {
    expect(D150_GodlySpouse.players).toBe('4+')
  })
})

describe('D152_Patron — player restriction', () => {
  it('has players set to 4+', () => {
    expect(D152_Patron.players).toBe('4+')
  })
})

describe('E128_Saddler — player restriction', () => {
  it('has players set to 3+', () => {
    expect(E128_Saddler.players).toBe('3+')
  })
})

// === E57_CheeseFondue — cost and VP ===

describe('E57_CheeseFondue — cost and VP', () => {
  it('costs 1 clay', () => {
    expect(E57_CheeseFondue.cost).toEqual({ clay: 1 })
  })

  it('is worth 1 VP', () => {
    expect(E57_CheeseFondue.vp).toBe(1)
  })
})

// === C37_DwellingMound — plow cost hook ===

describe('C37_DwellingMound — adds food cost to plow', () => {
  it('has vp set to 3', () => {
    expect(C37_DwellingMound.vp).toBe(3)
  })

  it('does not have a bonus modifier', () => {
    expect(C37_DwellingMound.modifier).toBeUndefined()
  })

  it('has a computeCosts listener on plow', () => {
    const listener = findListener('C37-dwelling-mound-costs-plow')
    expect(listener).toBeDefined()
    expect(listener!.actions).toEqual(['plow'])
    expect(listener!.phases).toEqual(['computeCosts'])
  })

  it('adds 1 food cost when card is played', () => {
    const listener = findListener('C37-dwelling-mound-costs-plow')!
    const player = createPlayer()
    player.minorPlayed = ['C37_DwellingMound']
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('plow'),
      actionId: 'plow', phase: 'computeCosts',
    } as any)
    expect(result?.costs).toEqual({ food: 1 })
  })

  it('does not add cost when card not played', () => {
    const listener = findListener('C37-dwelling-mound-costs-plow')!
    const player = createPlayer()
    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('plow'),
      actionId: 'plow', phase: 'computeCosts',
    } as any)
    expect(result).toBeUndefined()
  })
})

// === E130_Overachiever — resource choice discount ===

describe('E130_Overachiever — resource choice discount', () => {
  it('has players set to 3+', () => {
    expect(E130_Overachiever.players).toBe('3+')
  })

  it('returns bonuses when actionCardId matches', () => {
    const listener = findListener('E130-overachiever-compute-costs')!
    const player = createPlayer()
    player.minorPlayed = ['E130_Overachiever']

    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'computeCosts',
      actionCardId: 'E130_Overachiever',
    } as any)

    expect(result?.bonuses).toBeDefined()
    expect(result!.bonuses!.length).toBe(10)
    const woodBonus = result!.bonuses!.find(b => b.discount.wood === 1)
    expect(woodBonus).toBeDefined()
    expect(woodBonus!.optional).toBe(true)
    expect(woodBonus!.sources).toEqual(['E130_Overachiever'])
  })

  it('does not return bonuses when actionCardId does not match', () => {
    const listener = findListener('E130-overachiever-compute-costs')!
    const player = createPlayer()
    player.minorPlayed = ['E130_Overachiever']

    const result = executeCardListener(listener, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'computeCosts',
      actionCardId: 'improvement-any',
    } as any)
    expect(result).toBeUndefined()
  })
})

// === B70_NewPurchase — grain and vegetable options ===

describe('B70_NewPurchase — grain and vegetable', () => {
  it('returns two optional exchanges before harvest rounds', () => {
    const effect = getCardEffect('B70_NewPurchase')!
    const player = createPlayer()
    player.occupationPlayed = ['B70_NewPurchase']
    const state = createState(player)
    state.round = 4 // harvest round

    const flow = effect.onBeforeStartOfTurn!(state, player)
    expect(flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'seq', optional: true, promptKey: 'ui.interactionNewPurchaseGrain' },
        { type: 'seq', optional: true, promptKey: 'ui.interactionNewPurchaseVegetable' },
      ],
    })
  })

  it('does nothing on non-harvest rounds', () => {
    const effect = getCardEffect('B70_NewPurchase')!
    const player = createPlayer()
    player.occupationPlayed = ['B70_NewPurchase']
    player.resources.food = 10
    const state = createState(player)
    state.round = 3

    expect(effect.onBeforeStartOfTurn!(state, player)).toBeUndefined()
  })
})

// === A84_Silage — prerequisite, field grain, breeding ===

describe('A84_Silage — prerequisite, field grain, breeding', () => {
  it('has prerequisite of 2 Fields', () => {
    expect(A84_Silage.prerequisite).toBe('2 Fields')
  })

  it('does not return flow without 2 fields', () => {
    const effect = getCardEffect('A84_Silage')!
    const player = createPlayer()
    player.minorPlayed = ['A84_Silage']
    player.resources.grain = 2
    player.resources.sheep = 3
    player.fields = [{ crop: null, remaining: 0, row: 0, col: 1 }]
    const state = createState(player)
    state.round = 3

    const flow = effect.onReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('returns xor flow with animal choices when eligible', () => {
    const effect = getCardEffect('A84_Silage')!
    const player = createPlayer()
    player.minorPlayed = ['A84_Silage']
    player.resources.grain = 1
    player.resources.sheep = 2
    player.resources.cattle = 2
    player.fields = [
      { crop: null, remaining: 0, row: 0, col: 0 },
      { crop: null, remaining: 0, row: 0, col: 1 },
    ]
    const state = createState(player)
    state.round = 3

    const flow = effect.onReturnHome!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    expect(flow!.promptKey).toBe('ui.interactionSilage')
    // cattle + sheep + decline = 3 options
    const children = (flow as any).children
    expect(children).toHaveLength(3)
    // First is cattle (most valuable), second is sheep
    expect(children[0].children[1].params).toEqual({ cattle: 1 })
    expect(children[1].children[1].params).toEqual({ sheep: 1 })
    // Last is decline
    expect(children[2].actionId).toBe('noop')
  })

  it('includes pay-grain-any in each animal choice branch', () => {
    const effect = getCardEffect('A84_Silage')!
    const player = createPlayer()
    player.minorPlayed = ['A84_Silage']
    player.resources.grain = 1
    player.resources.sheep = 2
    player.fields = [
      { crop: null, remaining: 0, row: 0, col: 0 },
      { crop: null, remaining: 0, row: 0, col: 1 },
    ]
    const state = createState(player)
    state.round = 3

    const flow = effect.onReturnHome!(state, player)
    const children = (flow as any).children
    // Animal branch: seq of [pay-grain-any, gain]
    expect(children[0].type).toBe('seq')
    expect(children[0].children[0].actionId).toBe('pay-grain-any')
    expect(children[0].children[1].actionId).toBe('gain')
    expect(children[0].children).toHaveLength(2)
  })

  it('does not return flow on harvest rounds', () => {
    const effect = getCardEffect('A84_Silage')!
    const player = createPlayer()
    player.minorPlayed = ['A84_Silage']
    player.resources.grain = 1
    player.resources.sheep = 2
    player.fields = [
      { crop: null, remaining: 0, row: 0, col: 0 },
      { crop: null, remaining: 0, row: 0, col: 1 },
    ]
    const state = createState(player)
    state.round = 4 // harvest round

    const flow = effect.onReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('does not return flow without breedable animals', () => {
    const effect = getCardEffect('A84_Silage')!
    const player = createPlayer()
    player.minorPlayed = ['A84_Silage']
    player.resources.grain = 1
    player.resources.sheep = 1 // only 1, can't breed
    player.fields = [
      { crop: null, remaining: 0, row: 0, col: 0 },
      { crop: null, remaining: 0, row: 0, col: 1 },
    ]
    const state = createState(player)
    state.round = 3

    const flow = effect.onReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('does not return flow without any grain source', () => {
    const effect = getCardEffect('A84_Silage')!
    const player = createPlayer()
    player.minorPlayed = ['A84_Silage']
    player.resources.grain = 0
    player.resources.sheep = 2
    player.fields = [
      { crop: 'vegetable', remaining: 1, row: 0, col: 0 },
      { crop: null, remaining: 0, row: 0, col: 1 },
    ]
    const state = createState(player)
    state.round = 3

    const flow = effect.onReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('accepts field grain as source', () => {
    const effect = getCardEffect('A84_Silage')!
    const player = createPlayer()
    player.minorPlayed = ['A84_Silage']
    player.resources.grain = 0
    player.resources.sheep = 2
    player.fields = [
      { crop: 'grain', remaining: 2, row: 0, col: 0 },
      { crop: null, remaining: 0, row: 0, col: 1 },
    ]
    const state = createState(player)
    state.round = 3

    const flow = effect.onReturnHome!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
  })
})
