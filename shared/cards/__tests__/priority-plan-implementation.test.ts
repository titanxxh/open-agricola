import { describe, expect, it } from 'vitest'
import { executeCardListener, getRegisteredCardListeners } from '../card-listeners'
import { getCardEffect } from '../card-effects'
import { recordActionSnapshot } from '../helpers/action-snapshot'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'

import '../A/A29_AleBenches'
import '../A/A81_InterimStorage'
import { A123_FrameBuilder as A123Card } from '../A/A123_FrameBuilder'
import '../B/B94_StockProtector'
import '../B/B103_FieldMerchant'
import '../B/B34_SpecialFood'
import '../C/C60_SmallPottersOven'
import '../C/C71_SlurrySpreader'
import '../C/C88_CarpentersApprentice'
import '../C/C120_AgriculturalLabourer'
import '../D/D115_FodderPlanter'
import '../E/E52_Cubbyhole'
import '../E/E101_Blighter'
import { canRenovate, renovateHouseAction } from '../../actions/effects/renovation'
import { playImprovement } from '../../actions/effects/improvement'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
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
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
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
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find((listener) => listener.id === id)

describe('priority plan implementations', () => {
  it('A81 Interim Storage stores mapped resource before collect', () => {
    const listener = findListener('A81-interim-storage-before-collect')
    const player = createPlayer()
    player.minorPlayed = ['A81_InterimStorage']
    const space = createSpace('clay-pit')
    space.resources.clay = 2

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space,
      actionId: 'collect',
      phase: 'before',
    } as any)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'store-on-card',
      params: { wood: 1 },
      sourceCard: 'A81_InterimStorage',
    })
  })

  it('A81 Interim Storage pays out stored goods on round start', () => {
    const player = createPlayer()
    player.minorPlayed = ['A81_InterimStorage']
    player.cardStates = {
      A81_InterimStorage: { counters: { wood: 1, clay: 2 } },
    }
    const state = createState(player)
    state.round = 7

    const flow = getCardEffect('A81_InterimStorage')?.onRoundStart?.(state, player)
    expect(flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'take-from-card', params: { wood: 1 } },
        { type: 'leaf', actionId: 'take-from-card', params: { clay: 2 } },
      ],
    })
  })

  it('E52 Cubbyhole stores food for rooms built this action', () => {
    const listener = findListener('E52-cubbyhole-after-construct')
    const player = createPlayer()
    player.minorPlayed = ['E52_Cubbyhole']
    recordActionSnapshot(player, 1)
    player.roomTiles = [{ row: 0, col: 2 }, { row: 1, col: 2 }] as any

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('construct'),
      actionId: 'construct',
      phase: 'after',
    } as any)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'store-on-card',
      params: { food: 2 },
      sourceCard: 'E52_Cubbyhole',
    })
  })

  it('E52 Cubbyhole pays out food at feeding phase start', () => {
    const player = createPlayer()
    player.minorPlayed = ['E52_Cubbyhole']
    player.cardStates = { E52_Cubbyhole: { counters: { food: 3 } } }

    const flow = getCardEffect('E52_Cubbyhole')?.onStartHarvestFeedingPhase?.(createState(player), player)
    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'take-from-card',
      params: { food: 3 },
    })
  })

  it('A29 Ale-Benches offers optional return-home payment flow', () => {
    const player = createPlayer()
    player.minorPlayed = ['A29_AleBenches']
    player.resources.grain = 1

    const flow = getCardEffect('A29_AleBenches')?.onReturnHome?.(createState(player), player)
    expect(flow?.type).toBe('seq')
    if (flow?.type !== 'seq') return
    expect(flow.optional).toBe(true)
    expect(flow.children[0]).toMatchObject({
      type: 'leaf',
      actionId: 'pay-resources',
      params: { grain: 1 },
    })
    expect(flow.children[1]).toMatchObject({ type: 'leaf', actionId: 'bonus-vp' })
    expect(flow.children[2]).toMatchObject({
      type: 'leaf',
      actionId: 'gain-other-players',
      params: { food: 1 },
    })
  })

  it('B34 Special Food grants bonus VP when all collected animals fit', () => {
    const beforeListener = findListener('B34-special-food-before-collect')
    const afterListener = findListener('B34-special-food-after-collect')
    const player = createPlayer()
    player.minorPlayed = ['B34_SpecialFood']
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1

    executeCardListener(beforeListener!, {
      state: createState(player),
      player,
      space: createSpace('sheep-market'),
      actionId: 'collect',
      phase: 'before',
    } as any)

    const result = executeCardListener(afterListener!, {
      state: createState(player),
      player: {
        ...player,
        houseAnimalCount: 2,
      },
      space: createSpace('sheep-market'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { sheep: 1 } },
    } as any)

    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type !== 'seq') return
    expect(result.flow.children[0]).toMatchObject({ type: 'leaf', actionId: 'flag-card' })
    expect(result.flow.children[2]).toMatchObject({ type: 'leaf', actionId: 'bonus-vp' })
  })

  it('B103 Field Merchant gains wood and reed when played', () => {
    const listener = findListener('B103-field-merchant-after-play')
    const player = createPlayer()
    player.occupationPlayed = ['B103_FieldMerchant']

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('play-occupation'),
      actionId: 'play-occupation',
      phase: 'after',
      choice: 'B103_FieldMerchant',
    } as any)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { wood: 1, reed: 1 },
    })
  })

  it('E101 Blighter blocks further occupation plays via isDoable', () => {
    const listener = findListener('E101-blighter-isdoable-occupation')
    const player = createPlayer()
    player.occupationPlayed = ['E101_Blighter']

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('play-occupation'),
      actionId: 'play-occupation',
      phase: 'isDoable',
      doable: true,
    } as any)

    expect(result?.doable).toBe(false)
  })

  it('E101 Blighter grants bonus VP when played', () => {
    const listener = findListener('E101-blighter-after-play')
    const player = createPlayer()
    player.occupationPlayed = ['E101_Blighter']
    const state = createState(player)
    state.round = 8

    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('play-occupation'),
      actionId: 'play-occupation',
      phase: 'after',
      choice: 'E101_Blighter',
    } as any)

    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.children).toHaveLength(3)
      expect(result.flow.children.every((child) => child.type === 'leaf' && child.actionId === 'bonus-vp')).toBe(true)
    }
  })

  it('B94 Stock Protector can make fencing doable with bonus wood', () => {
    const listener = findListener('B94-stock-protector-isdoable-fencing')
    const player = createPlayer()
    player.minorPlayed = ['B94_StockProtector']
    player.resources.wood = 2

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'isDoable',
      doable: false,
    } as any)

    expect(result?.doable).toBe(true)
  })

  it('A123 Frame Builder can make renovation doable with wood substitution', () => {
    const listener = findListener('A123-frame-builder-isdoable-building')
    const player = createPlayer()
    player.occupationPlayed = ['A123_FrameBuilder']
    player.houseType = 'clay'
    player.resources.wood = 1
    player.resources.reed = 2
    player.activeModifiers = [
      ...((A123Card as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? []),
    ]

    expect(listener).toBeUndefined()
    expect(renovateHouseAction.canBeExecutedByPlayer(createState(player), player)).toBe(true)
    expect(canRenovate(player)).toBe(true)
  })

  it('C88 Carpenter\'s Apprentice reserves free late fences', () => {
    const listener = findListener('C88-carpenters-apprentice-before-fence')
    const player = createPlayer()
    player.occupationPlayed = ['C88_CarpentersApprentice']
    player.fences = 12

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'before',
    } as any)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'reserve-fence-bonus',
      params: { freeFences: 3 },
    })
  })

  it('C60 Small Potter\'s Oven returns an oven and then yields an onBuy gain flow', () => {
    const player = createPlayer()
    player.minorHand = ['C60_SmallPottersOven']
    player.improvements = ['Major_ClayOven']
    player.resources.clay = 2
    const state = createState(player)

    const result = playImprovement(state, player, 'C60_SmallPottersOven', 'minor')

    expect(result.type).toBe('flow')
    expect(player.minorPlayed).toContain('C60_SmallPottersOven')
    expect(player.improvements).not.toContain('Major_ClayOven')
    expect(state.availableMajorImprovements).toContain('Major_ClayOven')
    if (result.type !== 'flow') return
    expect(result.flow).toMatchObject({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: 'C60_SmallPottersOven',
          params: { food: 5 },
        },
      ],
    })
    expect(player.resources.food).toBe(0)
    expect(player.resources.clay).toBe(0)
  })

  it('C60 Small Potter\'s Oven asks which oven to return when both match', () => {
    const player = createPlayer()
    player.minorHand = ['C60_SmallPottersOven']
    player.improvements = ['Major_ClayOven', 'Major_StoneOven']
    player.resources.clay = 2
    const state = createState(player)

    const result = playImprovement(state, player, 'C60_SmallPottersOven', 'minor')

    expect(result.type).toBe('choice')
    if (result.type !== 'choice') return
    expect(result.promptKey).toBe('prompt.selectPayment')
    expect(result.options).toHaveLength(2)
    expect(result.options.map((option) => option.value)).toEqual([
      'pay:minor:C60_SmallPottersOven:0',
      'pay:minor:C60_SmallPottersOven:1',
    ])
    expect(result.options.map((option) => option.labelParams)).toMatchObject([
      { resourcesPaid: { clay: 2 }, cardUsed: 'Major_ClayOven' },
      { resourcesPaid: { clay: 2 }, cardUsed: 'Major_StoneOven' },
    ])
  })

  it('C60 Small Potter\'s Oven returns the specifically selected oven before onBuy gain flow', () => {
    const player = createPlayer()
    player.minorHand = ['C60_SmallPottersOven']
    player.improvements = ['Major_ClayOven', 'Major_StoneOven']
    player.resources.clay = 2
    const state = createState(player)

    const result = playImprovement(
      state,
      player,
      'pay:minor:C60_SmallPottersOven:1',
      'minor',
    )

    expect(result.type).toBe('flow')
    expect(player.improvements).toContain('Major_ClayOven')
    expect(player.improvements).not.toContain('Major_StoneOven')
    expect(state.availableMajorImprovements).toContain('Major_StoneOven')
    if (result.type !== 'flow') return
    expect(result.flow).toMatchObject({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: 'C60_SmallPottersOven',
          params: { food: 5 },
        },
      ],
    })
  })

  it('C60 Small Potter\'s Oven offers a restricted oven build before baking', () => {
    const listener = findListener('C60-small-potters-oven-before-bake')
    const player = createPlayer()
    player.minorPlayed = ['C60_SmallPottersOven']
    player.resources.clay = 3
    player.resources.stone = 1
    const state = createState(player)
    state.availableMajorImprovements = ['Major_ClayOven']

    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('grain-utilization'),
      actionId: 'bake-bread',
      phase: 'before',
    } as any)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'improvement-any',
      params: {
        allowedPurchases: ['Major_ClayOven'],
        suppressOnBuyEffects: true,
      },
      sourceCard: 'C60_SmallPottersOven',
    })
  })

  it('C120 Agricultural Labourer stores 8 clay when played', () => {
    const listener = findListener('C120-agricultural-labourer-after-play')
    const player = createPlayer()
    player.occupationPlayed = ['C120_AgriculturalLabourer']

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('play-occupation'),
      actionId: 'play-occupation',
      phase: 'after',
      choice: 'C120_AgriculturalLabourer',
    } as any)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'store-on-card',
      params: { clay: 8 },
    })
  })

  it('C120 Agricultural Labourer grants clay after grain gain', () => {
    const listener = findListener('C120-agricultural-labourer-after-gain')
    const player = createPlayer()
    player.occupationPlayed = ['C120_AgriculturalLabourer']
    player.cardStates = { C120_AgriculturalLabourer: { counters: { clay: 4 } } }

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('gain'),
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { grain: 2 } },
    } as any)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'take-from-card',
      params: { clay: 2 },
    })
  })

  it('C120 Agricultural Labourer gains clay after reap', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C120_AgriculturalLabourer']
    player.cardStates = { C120_AgriculturalLabourer: { counters: { clay: 3 } } }
    player.fields = [
      { row: 0, col: 0, crop: 'grain', remaining: 2 },
      { row: 0, col: 1, crop: 'grain', remaining: 1 },
    ]

    const result = getCardEffect('C120_AgriculturalLabourer')?.onAfterReap?.(
      createState(player),
      player,
    )

    expect(result).toMatchObject({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'take-from-card',
          params: { clay: 2 },
          sourceCard: 'C120_AgriculturalLabourer',
        },
      ],
    })
    expect(player.resources.clay).toBe(0)
    expect(player.cardStates?.C120_AgriculturalLabourer?.counters?.clay).toBe(3)
  })

  it('A64 Barley Mill returns an after-reap gain flow', () => {
    const player = createPlayer()
    player.minorPlayed = ['A64_BarleyMill']
    player.fields = [
      { row: 0, col: 0, crop: 'grain', remaining: 2 },
      { row: 0, col: 1, crop: 'grain', remaining: 1 },
    ]

    const result = getCardEffect('A64_BarleyMill')?.onAfterReap?.(
      createState(player),
      player,
    )

    expect(result).toMatchObject({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 2 },
          sourceCard: 'A64_BarleyMill',
        },
        {
          type: 'leaf',
          actionId: 'mark-card-trigger',
          sourceCard: 'A64_BarleyMill',
        },
      ],
    })
    expect(player.resources.food).toBe(0)
  })

  it('C71 Slurry Spreader returns an optional sow flow after breeding two animal types', () => {
    const player = createPlayer()
    player.minorPlayed = ['C71_SlurrySpreader']
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]

    const result = getCardEffect('C71_SlurrySpreader')?.onEndHarvest?.(
      {
        ...createState(player),
        harvestBreedSummary: {
          [player.id]: {
            resources: { sheep: 1, boar: 1 },
            animalTypes: 2,
            animalCount: 2,
          },
        },
      },
      player,
    )

    expect(result).toMatchObject({
      type: 'leaf',
      actionId: 'sow',
      optional: true,
      promptKey: 'ui.interactionSlurrySpreaderSow',
      sourceCard: 'C71_SlurrySpreader',
    })
  })

  it('C71 Slurry Spreader does not trigger after breeding only one animal type', () => {
    const player = createPlayer()
    player.minorPlayed = ['C71_SlurrySpreader']
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]

    const result = getCardEffect('C71_SlurrySpreader')?.onEndHarvest?.(
      {
        ...createState(player),
        harvestBreedSummary: {
          [player.id]: {
            resources: { sheep: 1 },
            animalTypes: 1,
            animalCount: 1,
          },
        },
      },
      player,
    )

    expect(result).toBeUndefined()
  })

  it('D115 Fodder Planter returns sow flow with newborn-based maxSelections', () => {
    const player = createPlayer()
    player.occupationPlayed = ['D115_FodderPlanter']
    player.resources.grain = 2
    player.fields = [
      { row: 0, col: 0, crop: null, remaining: 0 },
      { row: 0, col: 1, crop: null, remaining: 0 },
    ]

    const result = getCardEffect('D115_FodderPlanter')?.onEndHarvest?.(
      {
        ...createState(player),
        harvestBreedSummary: {
          [player.id]: {
            resources: { sheep: 1, boar: 1 },
            animalTypes: 2,
            animalCount: 2,
          },
        },
      },
      player,
    )

    expect(result).toMatchObject({
      type: 'leaf',
      actionId: 'sow',
      optional: true,
      promptKey: 'ui.interactionFodderPlanterSow',
      sourceCard: 'D115_FodderPlanter',
      actionContext: {
        maxSelections: 2,
        excludedFields: [],
      },
    })
  })
})
