import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionExecutionContext, ActionSpace, GameState, PlayerState } from '../../shared/game/types'

import '../../shared/cards/B/B146_Illusionist'
import { getActionDefinition } from '../../shared/actions/index'
import type { ActionFlow } from '../../shared/game/types'

const DISCARD_ACTION_ID = 'card_B146_Illusionist_discard-from-hand'


const CARD_ID = 'B146_Illusionist'

const createPlayer = (id = 'p1'): PlayerState =>
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
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createSpace = (
  id: string,
  resources: Partial<{ wood: number; clay: number; reed: number; stone: number }>,
): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' as const }),
    resources: {
      wood: resources.wood ?? 0,
      clay: resources.clay ?? 0,
      reed: resources.reed ?? 0,
      stone: resources.stone ?? 0,
      food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: [],
  }) as unknown as ActionSpace

const createState = (
  players: PlayerState[],
  spaces: ActionSpace[],
): GameState =>
  ({
    round: 3,
    currentPlayerIndex: 0,
    players,
    actionSpaces: spaces,
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

const findListener = () =>
  getRegisteredCardListeners().find(
    (l) => l.id === 'B146-illusionist-before-collect',
  )

describe('B146_Illusionist listener registration', () => {
  it('is registered on collect before (player scope)', () => {
    const listener = findListener()
    expect(listener).toBeDefined()
    expect(listener!.actions).toContain('collect')
    expect(listener!.phases).toContain('before')
    expect(listener!.scope).toBe('player')
  })
})

describe('B146_Illusionist listener handler', () => {

  it('does nothing when hand is empty', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = player.id
    const state = createState([player], [forest])

    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does nothing when Lantern House (C35) is played', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID, 'C35_LanternHouse')
    player.occupationHand = ['A9_SheepFarmer']
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = player.id
    const state = createState([player], [forest])

    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does nothing on a non-building-resource space (food accumulation)', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A9_SheepFarmer']
    const fishing = createSpace('fishing', {})
    // fishing accumulates food — no wood/clay/reed/stone.
    fishing.resources.food = 2
    fishing.takenBy = player.id
    const state = createState([player], [fishing])

    const result = executeCardListener(listener, {
      state,
      player,
      space: fishing,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('returns optional seq [discard-from-hand, gain wood 1] for forest', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A9_SheepFarmer']
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = player.id
    const state = createState([player], [forest])

    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(2)
    expect(flow.children[0].actionId).toBe(DISCARD_ACTION_ID)
    expect(flow.children[0].sourceCard).toBe(CARD_ID)
    expect(flow.children[1].actionId).toBe('gain')
    expect(flow.children[1].params).toEqual({ wood: 1 })
    expect(flow.children[1].sourceCard).toBe(CARD_ID)
  })

  it('picks clay when accumulating clay', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.minorHand = ['A1_AnimalPen']
    const clayPit = createSpace('clay-pit', { clay: 2 })
    clayPit.takenBy = player.id
    const state = createState([player], [clayPit])

    const result = executeCardListener(listener, {
      state,
      player,
      space: clayPit,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[1].params).toEqual({ clay: 1 })
  })

  it('picks reed when accumulating reed', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A9_SheepFarmer']
    const reedBank = createSpace('reed-bank', { reed: 1 })
    reedBank.takenBy = player.id
    const state = createState([player], [reedBank])

    const result = executeCardListener(listener, {
      state,
      player,
      space: reedBank,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[1].params).toEqual({ reed: 1 })
  })

  it('picks stone when accumulating stone', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A9_SheepFarmer']
    const quarry = createSpace('eastern-quarry', { stone: 1 })
    quarry.takenBy = player.id
    const state = createState([player], [quarry])

    const result = executeCardListener(listener, {
      state,
      player,
      space: quarry,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.children[1].params).toEqual({ stone: 1 })
  })

  it('accepts minor-hand cards as discard candidates too', () => {
    const listener = findListener()!
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = []
    player.minorHand = ['A1_AnimalPen']
    const forest = createSpace('forest', { wood: 3 })
    forest.takenBy = player.id
    const state = createState([player], [forest])

    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'collect',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
  })
})

// Direct tests of the discard-from-hand action registration (leaf payload).
describe('discard-from-hand action', () => {
  it('is registered via internalActionDefinitions and exposes choice', () => {
    const def = getActionDefinition(DISCARD_ACTION_ID)
    expect(def).toBeDefined()

    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer', 'A124_Knapper']
    player.minorHand = ['A1_AnimalPen']

    const forest = createSpace('forest', { wood: 3 })
    const state = createState([player], [forest])
    const result = def!.execute({ state, player, space: forest, params: {} } as unknown as ActionExecutionContext)
    expect(result.type).toBe('choice')
    if (result.type === 'choice') {
      expect(result.options).toHaveLength(3)
      expect(result.options.map((o) => o.value)).toEqual([
        'occ:A9_SheepFarmer',
        'occ:A124_Knapper',
        'min:A1_AnimalPen',
      ])
    }
  })

  it('resolveChoice removes the chosen occupation from hand', () => {
    const def = getActionDefinition(DISCARD_ACTION_ID)!
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer', 'A124_Knapper']

    const forest = createSpace('forest', { wood: 3 })
    const state = createState([player], [forest])
    const result = def.resolveChoice!(
      { state, player, space: forest, params: {} } as unknown as ActionExecutionContext,
      'occ:A9_SheepFarmer',
    )
    expect(result.type).toBe('ok')
    expect(player.occupationHand).toEqual(['A124_Knapper'])
  })

  it('resolveChoice removes the chosen minor card from hand', () => {
    const def = getActionDefinition(DISCARD_ACTION_ID)!
    const player = createPlayer('p1')
    player.minorHand = ['A1_AnimalPen', 'A2_Basket']

    const forest = createSpace('forest', { wood: 3 })
    const state = createState([player], [forest])
    const result = def.resolveChoice!(
      { state, player, space: forest, params: {} } as unknown as ActionExecutionContext,
      'min:A2_Basket',
    )
    expect(result.type).toBe('ok')
    expect(player.minorHand).toEqual(['A1_AnimalPen'])
  })

  it('resolveChoice fails when choice points at a card not in hand', () => {
    const def = getActionDefinition(DISCARD_ACTION_ID)!
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer']

    const forest = createSpace('forest', { wood: 3 })
    const state = createState([player], [forest])
    const result = def.resolveChoice!(
      { state, player, space: forest, params: {} } as unknown as ActionExecutionContext,
      'occ:NotInHand',
    )
    expect(result.type).toBe('fail')
  })
})
