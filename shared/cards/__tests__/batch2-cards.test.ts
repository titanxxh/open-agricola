import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../B/B75_WoodWorkshop'
import '../A/A55_JunkRoom'
import '../A/A65_SeedPellets'
import '../A/A79_GardenHoe'
import '../A/A83_ShepherdsCrook'
import '../A/A105_BarrowPusher'
import '../A/A108_MushroomCollector'
import '../A/A109_SmallTrader'
import '../A/A110_Roughcaster'
import '../C/C75_Firewood'
import '../C/C88_CarpentersApprentice'
import '../C/C96_Merchant'
import '../D/D119_WoodBarterer'
import '../E/E128_Saddler'
import { C88_CarpentersApprentice as C88Card } from '../C/C88_CarpentersApprentice'
import { payResourcesAction } from '../../actions/effects/pay-resources'
import { returnToSpaceAction } from '../../actions/effects/return-to-space'
import { takeFromCardAction } from '../../actions/effects/take-from-card'

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
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('B75_WoodWorkshop', () => {
  it('returns gain flow with 1 wood before improvement', () => {
    const listener = findListener('B75-wood-workshop-before-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['B75_WoodWorkshop']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'before',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ wood: 1 })
    }
    expect(result?.logKey).toBe('log.cardEffectGain')
    expect(player.cardStates?.B75_WoodWorkshop?.counters?.triggerCount).toBe(1)
  })

  it('isDoable returns true for improvement', () => {
    const listener = findListener('B75-wood-workshop-isdoable-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['B75_WoodWorkshop']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'isDoable',
    } as any)
    expect(result?.doable).toBe(true)
  })

  it('does not trigger when card not played', () => {
    const listener = findListener('B75-wood-workshop-before-improvement')
    const player = createPlayer()
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })
})

describe('A65_SeedPellets', () => {
  it('returns gain flow with 1 grain before sow', () => {
    const listener = findListener('A65-seed-pellets-before-sow')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A65_SeedPellets']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('sow'),
      actionId: 'sow', phase: 'before',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ grain: 1 })
    }
    expect(player.cardStates?.A65_SeedPellets?.counters?.triggerCount).toBe(1)
  })

  it('does not trigger when card not played', () => {
    const listener = findListener('A65-seed-pellets-before-sow')
    const player = createPlayer()
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('sow'),
      actionId: 'sow', phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })
})

describe('C88_CarpentersApprentice', () => {
  it('reduces construct cost by 2 wood for wood house', () => {
    const listener = findListener('C88-carpenters-apprentice-costs-construct')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['C88_CarpentersApprentice']
    player.houseType = 'wood'
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'computeCosts',
    } as any)
    expect(result?.costs).toEqual({ wood: -2 })
    expect(player.cardStates?.C88_CarpentersApprentice?.counters?.triggerCount).toBe(1)
  })

  it('does not reduce for clay house', () => {
    const listener = findListener('C88-carpenters-apprentice-costs-construct')
    const player = createPlayer()
    player.occupationPlayed = ['C88_CarpentersApprentice']
    player.houseType = 'clay'
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'computeCosts',
    } as any)
    expect(result).toBeUndefined()
  })

  it('reduces stables cost by 1 wood for 3rd+ stable', () => {
    const listener = findListener('C88-carpenters-apprentice-costs-stables')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['C88_CarpentersApprentice']
    player.stableTiles = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ] as any
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('stables'),
      actionId: 'stables', phase: 'computeCosts',
    } as any)
    expect(result?.costs).toEqual({ wood: -1 })
  })

  it('does not reduce stables cost for 1st-2nd stable', () => {
    const listener = findListener('C88-carpenters-apprentice-costs-stables')
    const player = createPlayer()
    player.occupationPlayed = ['C88_CarpentersApprentice']
    player.stableTiles = [{ x: 0, y: 0 }] as any
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('stables'),
      actionId: 'stables', phase: 'computeCosts',
    } as any)
    expect(result).toBeUndefined()
  })

  it('uses listeners instead of a global construct modifier', () => {
    const card = C88Card as any
    expect(card.modifier).toBeUndefined()
    expect(findListener('C88-carpenters-apprentice-costs-construct')).toBeDefined()
    expect(findListener('C88-carpenters-apprentice-before-fence')).toBeDefined()
  })
})

describe('A55_JunkRoom', () => {
  it('gains 1 food during improvement actions', () => {
    const listener = findListener('A55-junk-room-during-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A55_JunkRoom']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'during',
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ food: 1 })
    }
  })
})

describe('A79_GardenHoe', () => {
  it('gains clay and stone after sowing vegetables', () => {
    const listener = findListener('A79-garden-hoe-after-sow')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A79_GardenHoe']
    player.fields = [{ x: 0, y: 0, crop: 'vegetable', remaining: 2 }] as any
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('sow'),
      actionId: 'sow', phase: 'after', result: { type: 'ok' },
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ clay: 1, stone: 1 })
    }
  })

  it('does not trigger without a planted vegetable field', () => {
    const listener = findListener('A79-garden-hoe-after-sow')
    const player = createPlayer()
    player.minorPlayed = ['A79_GardenHoe']
    player.fields = [{ x: 0, y: 0, crop: 'grain', remaining: 3 }] as any
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('sow'),
      actionId: 'sow', phase: 'after', result: { type: 'ok' },
    } as any)
    expect(result).toBeUndefined()
  })
})

describe('A83_ShepherdsCrook', () => {
  it('gains 2 sheep for each newly fenced large pasture', () => {
    const listener = findListener('A83-shepherds-crook-after-fencing')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A83_ShepherdsCrook']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('fence'),
      actionId: 'fence',
      phase: 'immediatelyAfter',
      result: {
        type: 'ok',
        extraData: {
          newPastures: [
            {
              id: 'p1',
              tiles: [
                { row: 0, col: 0 },
                { row: 0, col: 1 },
                { row: 1, col: 0 },
                { row: 1, col: 1 },
              ],
            },
          ],
        },
      },
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ sheep: 2 })
    }
  })

  it('does not trigger when no newly fenced pasture is large enough', () => {
    const listener = findListener('A83-shepherds-crook-after-fencing')
    const player = createPlayer()
    player.minorPlayed = ['A83_ShepherdsCrook']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('fence'),
      actionId: 'fence',
      phase: 'immediatelyAfter',
      result: {
        type: 'ok',
        extraData: {
          newPastures: [
            {
              id: 'p1',
              tiles: [
                { row: 0, col: 0 },
                { row: 0, col: 1 },
                { row: 1, col: 0 },
              ],
            },
          ],
        },
      },
    } as any)
    expect(result).toBeUndefined()
  })
})

describe('A105_BarrowPusher', () => {
  it('gains clay and food after plow', () => {
    const listener = findListener('A105-barrow-pusher-after-plow')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A105_BarrowPusher']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('plow'),
      actionId: 'plow', phase: 'after', result: { type: 'ok' },
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ clay: 1, food: 1 })
    }
  })
})

describe('A108_MushroomCollector', () => {
  it('returns an optional seq after collecting from a wood accumulation space', () => {
    const listener = findListener('A108-mushroom-collector-immediately-after')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A108_MushroomCollector']
    const space = createSpace('copse')
    space.gainPerRound.wood = 1
    const result = executeCardListener(listener!, {
      state: createState(player), player, space,
      actionId: 'collect', phase: 'immediatelyAfter', result: { type: 'ok', resourcesGained: { wood: 3 } },
    } as any)
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toEqual([
        { type: 'leaf', actionId: 'return-to-space', params: { wood: 1 }, sourceCard: 'A108_MushroomCollector', choiceLabelKey: 'occupations.A108_MushroomCollector.name' },
        { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: 'A108_MushroomCollector' },
      ])
    }
  })

  it('does not trigger on non-wood accumulation spaces', () => {
    const listener = findListener('A108-mushroom-collector-immediately-after')
    const player = createPlayer()
    player.occupationPlayed = ['A108_MushroomCollector']
    const space = createSpace('reed-bank')
    const result = executeCardListener(listener!, {
      state: createState(player), player, space,
      actionId: 'collect', phase: 'immediatelyAfter', result: { type: 'ok', resourcesGained: { reed: 1 } },
    } as any)
    expect(result).toBeUndefined()
  })

  it('return-to-space action moves wood from player back to the space', () => {
    const player = createPlayer()
    player.resources.wood = 2
    const space = createSpace('copse')
    const result = returnToSpaceAction.execute({
      state: createState(player),
      player,
      space,
      params: { wood: 1 },
    })
    expect(result.type).toBe('ok')
    expect(player.resources.wood).toBe(1)
    expect(space.resources.wood).toBe(1)
  })
})

describe('A109_SmallTrader', () => {
  it('gains 3 food after playing a minor from improvement-any', () => {
    const listener = findListener('A109-small-trader-after-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A109_SmallTrader']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after', choice: 'minor:A55_JunkRoom', result: { type: 'ok' },
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 3 })
    }
  })

  it('does not trigger when taking a major improvement', () => {
    const listener = findListener('A109-small-trader-after-improvement')
    const player = createPlayer()
    player.occupationPlayed = ['A109_SmallTrader']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after', choice: 'major:Major_Well', result: { type: 'ok' },
    } as any)
    expect(result).toBeUndefined()
  })
})

describe('A110_Roughcaster', () => {
  it('gains 3 food after constructing clay rooms', () => {
    const listener = findListener('A110-roughcaster-after-construct')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'clay'
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after', result: { type: 'ok' },
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 3 })
    }
  })

  it('gains 3 food after renovating to stone', () => {
    const listener = findListener('A110-roughcaster-after-renovate')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A110_Roughcaster']
    player.houseType = 'stone'
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after', result: { type: 'ok' },
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 3 })
    }
  })
})

describe('C96_Merchant', () => {
  it('returns optional pay flow after improvement', () => {
    const listener = findListener('C96-merchant-immediately-after-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['C96_Merchant']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'immediatelyAfter', result: { type: 'ok' },
    } as any)
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toEqual([
        { type: 'leaf', actionId: 'pay-resources', params: { food: 1 }, sourceCard: 'C96_Merchant' },
        {
          type: 'leaf',
          actionId: 'improvement-any',
          optional: true,
          promptKey: 'ui.interactionMerchantPrompt',
          sourceCard: 'C96_Merchant',
        },
      ])
    }
  })

  it('does not retrigger when the improvement comes from merchant itself', () => {
    const listener = findListener('C96-merchant-immediately-after-improvement')
    const player = createPlayer()
    player.occupationPlayed = ['C96_Merchant']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'immediatelyAfter', sourceCard: 'C96_Merchant', result: { type: 'ok' },
    } as any)
    expect(result).toBeUndefined()
  })
})

describe('E128_Saddler', () => {
  it('returns optional pay then plow flow after major improvement', () => {
    const listener = findListener('E128-saddler-after-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['E128_Saddler']
    player.resources.food = 2
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after', choice: 'major:Major_Well', result: { type: 'ok' },
    } as any)
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toEqual([
        { type: 'leaf', actionId: 'pay-resources', params: { food: 1 }, sourceCard: 'E128_Saddler' },
        { type: 'leaf', actionId: 'plow' },
      ])
    }
  })

  it('pay-resources action deducts food for saddler flow', () => {
    const player = createPlayer()
    player.resources.food = 2
    const result = payResourcesAction.execute({
      state: createState(player),
      player,
      space: createSpace('improvement-any'),
      params: { food: 1 },
      sourceCard: 'E128_Saddler',
    })
    expect(result.type).toBe('ok')
    expect(player.resources.food).toBe(1)
  })
})

describe('C75_Firewood', () => {
  it('returns optional xor flow after building an oven', () => {
    const listener = findListener('C75-firewood-after-build')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['C75_Firewood']
    player.cardStates = { C75_Firewood: { counters: { wood: 2 } } }
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('improvement-any'),
      actionId: 'improvement-any', phase: 'after', choice: 'major:Major_Fireplace1', result: { type: 'ok' },
    } as any)
    expect(result?.flow?.type).toBe('xor')
    if (result?.flow?.type === 'xor') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toEqual([
        {
          type: 'leaf',
          actionId: 'take-from-card',
          params: { wood: 1 },
          sourceCard: 'C75_Firewood',
          choiceLabelKey: 'ui.interactionFirewoodExchangeCount',
          choiceLabelParams: { count: 1 },
        },
        {
          type: 'leaf',
          actionId: 'take-from-card',
          params: { wood: 2 },
          sourceCard: 'C75_Firewood',
          choiceLabelKey: 'ui.interactionFirewoodExchangeCount',
          choiceLabelParams: { count: 2 },
        },
      ])
    }
  })

  it('take-from-card action moves stored wood to supply', () => {
    const player = createPlayer()
    player.cardStates = { C75_Firewood: { counters: { wood: 3 } } }
    const result = takeFromCardAction.execute({
      state: createState(player),
      player,
      space: createSpace('improvement-any'),
      params: { wood: 2 },
      sourceCard: 'C75_Firewood',
    })
    expect(result.type).toBe('ok')
    expect(player.cardStates?.C75_Firewood?.counters?.wood).toBe(1)
    expect(player.resources.wood).toBe(2)
  })
})

describe('D119_WoodBarterer', () => {
  it('returns optional xor flow with direct branches', () => {
    const listener = findListener('D119-wood-barterer-before-fence-construct')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['D119_WoodBarterer']
    player.resources.wood = 2
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('construct'),
      actionId: 'construct', phase: 'before',
    } as any)
    expect(result?.flow?.type).toBe('xor')
    if (result?.flow?.type === 'xor') {
      expect(result.flow.children[0]).toEqual({
        type: 'leaf',
        actionId: 'gain',
        params: { wood: 2 },
        sourceCard: 'D119_WoodBarterer',
        choiceLabelKey: 'ui.interactionWoodBarterer2Wood',
      })
      expect(result.flow.children[1]).toEqual({
        type: 'seq',
        optional: false,
        promptKey: undefined,
        children: [
          {
            type: 'leaf',
            actionId: 'pay-resources',
            params: { wood: 1 },
            sourceCard: 'D119_WoodBarterer',
            choiceLabelKey: 'ui.interactionWoodBartererTrade1',
            choiceLabelParams: undefined,
          },
          {
            type: 'leaf',
            actionId: 'gain',
            params: { reed: 1 },
            sourceCard: 'D119_WoodBarterer',
            choiceLabelKey: undefined,
            choiceLabelParams: undefined,
          },
        ],
      })
    }
  })
})
