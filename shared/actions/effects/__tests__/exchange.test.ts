import { describe, it, expect } from 'vitest'
import {
  anytimeExchangeAction,
  canAffordTrade,
  getMaxTradeTimes,
  applyTrade,
  getPossibleTradeTimes,
  reverseTrade,
} from '../exchange'
import { convertResources, hasValidResources } from '../../helpers/trades'
import type { DraftGameEvent, EventSink } from '../../../contract/events'
import type { ActionMutationContext, ActionSpace, GameState, PlayerState, Resource, Trade } from '../../../contract/types'
import { SessionCardContext, withSessionContext } from '../../../cards/session-card-context'

const makeEventSink = (capturedEvents: DraftGameEvent[]): EventSink => ({
  emit: (event) => {
    capturedEvents.push(event)
  },
  emitMany: (events) => {
    capturedEvents.push(...events)
  },
})

const createMockPlayer = (resources: Partial<Resource>): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
  color: 'red',
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0, ...resources },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false, activeModifiers: [], cardStates: {},
})

describe('canAffordTrade', () => {
  it('returns true when player has exact resources for trade', () => {
    const player = createMockPlayer({ wood: 2 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 } }
    expect(canAffordTrade(player, trade)).toBe(true)
  })

  it('returns true when player has more than required resources', () => {
    const player = createMockPlayer({ wood: 5 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 } }
    expect(canAffordTrade(player, trade)).toBe(true)
  })

  it('returns false when player lacks resources', () => {
    const player = createMockPlayer({ wood: 1 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 } }
    expect(canAffordTrade(player, trade)).toBe(false)
  })

  it('handles multiple resource types in trade', () => {
    const player = createMockPlayer({ wood: 2, clay: 3 })
    const trade: Trade = { from: { wood: 1, clay: 2 }, to: { food: 2 } }
    expect(canAffordTrade(player, trade)).toBe(true)
  })

  it('returns false when missing one resource type', () => {
    const player = createMockPlayer({ wood: 2 })
    const trade: Trade = { from: { wood: 1, clay: 2 }, to: { food: 2 } }
    expect(canAffordTrade(player, trade)).toBe(false)
  })

  it('respects times parameter', () => {
    const player = createMockPlayer({ wood: 4 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 } }
    expect(canAffordTrade(player, trade, 2)).toBe(true)
    expect(canAffordTrade(player, trade, 3)).toBe(false)
  })
})

describe('getMaxTradeTimes', () => {
  it('calculates max based on available resources', () => {
    const player = createMockPlayer({ wood: 6 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 } }
    expect(getMaxTradeTimes(player, trade)).toBe(3)
  })

  it('respects trade max limit', () => {
    const player = createMockPlayer({ wood: 10 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 }, max: 2 }
    expect(getMaxTradeTimes(player, trade)).toBe(2)
  })

  it('returns 0 when no resources available', () => {
    const player = createMockPlayer({ wood: 0 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 } }
    expect(getMaxTradeTimes(player, trade)).toBe(0)
  })

  it('handles multiple resource constraints', () => {
    const player = createMockPlayer({ wood: 10, clay: 3 })
    const trade: Trade = { from: { wood: 2, clay: 1 }, to: { food: 2 } }
    expect(getMaxTradeTimes(player, trade)).toBe(3)
  })

  it('uses minimum of all resource constraints', () => {
    const player = createMockPlayer({ wood: 4, clay: 1 })
    const trade: Trade = { from: { wood: 2, clay: 1 }, to: { food: 2 } }
    expect(getMaxTradeTimes(player, trade)).toBe(1)
  })
})

describe('applyTrade', () => {
  it('deducts from resources and adds to resources', () => {
    const player = createMockPlayer({ wood: 5, food: 0 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 3 } }
    applyTrade(player, trade)
    expect(player.resources.wood).toBe(3)
    expect(player.resources.food).toBe(3)
  })

  it('applies trade multiple times', () => {
    const player = createMockPlayer({ wood: 6, food: 0 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 3 } }
    applyTrade(player, trade, 2)
    expect(player.resources.wood).toBe(2)
    expect(player.resources.food).toBe(6)
  })

  it('handles trades with multiple resource types', () => {
    const player = createMockPlayer({ wood: 4, clay: 2, food: 0 })
    const trade: Trade = { from: { wood: 2, clay: 1 }, to: { food: 5 } }
    applyTrade(player, trade)
    expect(player.resources.wood).toBe(2)
    expect(player.resources.clay).toBe(1)
    expect(player.resources.food).toBe(5)
  })

  it('handles zero times gracefully', () => {
    const player = createMockPlayer({ wood: 5 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 3 } }
    applyTrade(player, trade, 0)
    expect(player.resources.wood).toBe(5)
    expect(player.resources.food).toBe(0)
  })

  it('deducts M084 lying horses before standing horses', () => {
    const player = createMockPlayer({ horse: 2, food: 0 })
    player.minorPlayed = ['M084_BogPony']
    player.cardStates = {
      M084_BogPony: { extraData: { privateAnimalCounts: { horse: 1 } } },
    }
    player.pastures = [{
      id: 'pasture-1',
      size: 1,
      tiles: [{ row: 0, col: 0 }],
      stables: 0,
      animalType: 'horse',
      animalCount: 1,
    }]
    const trade: Trade = { from: { horse: 1 }, to: { food: 2 } }

    applyTrade(player, trade)

    expect(player.resources.horse).toBe(1)
    expect(player.resources.food).toBe(2)
    expect(player.cardStates.M084_BogPony?.extraData?.privateAnimalCounts?.horse ?? 0).toBe(0)
    expect(player.pastures[0]).toMatchObject({ animalType: 'horse', animalCount: 1 })
  })

  it('does not prioritize ordinary card-zone animals before board animals', () => {
    const player = createMockPlayer({ horse: 2, food: 0 })
    player.cardStates = {
      M035_HorseTrough: { extraData: { animalCounts: { horse: 1 } } },
    }
    player.pastures = [{
      id: 'pasture-1',
      size: 1,
      tiles: [{ row: 0, col: 0 }],
      stables: 0,
      animalType: 'horse',
      animalCount: 1,
    }]
    const trade: Trade = { from: { horse: 1 }, to: { food: 2 } }

    applyTrade(player, trade)

    expect(player.resources.horse).toBe(1)
    expect(player.resources.food).toBe(2)
    expect(player.cardStates.M035_HorseTrough?.extraData?.animalCounts?.horse ?? 0).toBe(1)
    expect(player.pastures[0]).toMatchObject({ animalType: null, animalCount: 0 })
  })

  it('deducts animals from farm-position-backed card zones', () => {
    const player = createMockPlayer({ horse: 1, food: 0 })
    player.cardStates = {
      M034_HomeWood: {
        extraData: {
          animalCountsByZone: {
            'card:M034_HomeWood@0,0': { animalCounts: { horse: 1 } },
          },
        },
      },
    }
    const trade: Trade = { from: { horse: 1 }, to: { food: 2 } }

    applyTrade(player, trade)

    expect(player.resources.horse).toBe(0)
    expect(player.resources.food).toBe(2)
    const zone = player.cardStates.M034_HomeWood?.extraData?.animalCountsByZone?.['card:M034_HomeWood@0,0']
    expect(zone?.animalCounts?.horse ?? 0).toBe(0)
    expect(zone?.held ?? 0).toBe(0)
  })
})

describe('convertResources', () => {
  it('returns new resources without mutation', () => {
    const resources = { wood: 5, food: 0 }
    const trade: Trade = { from: { wood: 2 }, to: { food: 3 } }
    const result = convertResources(resources, trade)
    expect(resources.wood).toBe(5)
    expect(result.wood).toBe(3)
    expect(result.food).toBe(3)
  })

  it('applies trade multiple times', () => {
    const resources = { wood: 10 }
    const trade: Trade = { from: { wood: 2 }, to: { food: 3 } }
    const result = convertResources(resources, trade, 3)
    expect(result.wood).toBe(4)
    expect(result.food).toBe(9)
  })

  it('handles negative results (overdraft)', () => {
    const resources = { wood: 1 }
    const trade: Trade = { from: { wood: 2 }, to: { food: 3 } }
    const result = convertResources(resources, trade)
    expect(result.wood).toBe(-1)
  })
})

describe('hasValidResources', () => {
  it('returns true for all non-negative resources', () => {
    expect(hasValidResources({ wood: 0, clay: 5 })).toBe(true)
  })

  it('returns false for any negative resource', () => {
    expect(hasValidResources({ wood: -1 })).toBe(false)
  })

  it('returns true for empty resources', () => {
    expect(hasValidResources({})).toBe(true)
  })
})

describe('getPossibleTradeTimes', () => {
  it('returns array from 0 to max times', () => {
    const player = createMockPlayer({ wood: 6 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 } }
    expect(getPossibleTradeTimes(player, trade)).toEqual([0, 1, 2, 3])
  })

  it('respects max limit in trade', () => {
    const player = createMockPlayer({ wood: 10 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 }, max: 2 }
    expect(getPossibleTradeTimes(player, trade)).toEqual([0, 1, 2])
  })

  it('returns [0] when no resources available', () => {
    const player = createMockPlayer({ wood: 0 })
    const trade: Trade = { from: { wood: 2 }, to: { food: 1 } }
    expect(getPossibleTradeTimes(player, trade)).toEqual([0])
  })
})

describe('reverseTrade', () => {
  it('swaps from and to', () => {
    const trade: Trade = { from: { wood: 2 }, to: { food: 3 } }
    const reversed = reverseTrade(trade)
    expect(reversed.from).toEqual({ food: 3 })
    expect(reversed.to).toEqual({ wood: 2 })
  })

  it('preserves max, source, sourceId', () => {
    const trade: Trade = {
      from: { wood: 2 },
      to: { food: 3 },
      max: 5,
      source: 'test',
      sourceId: 'card1',
    }
    const reversed = reverseTrade(trade)
    expect(reversed.max).toBe(5)
    expect(reversed.source).toBe('test')
    expect(reversed.sourceId).toBe('card1')
  })
})

describe('anytimeExchangeAction events', () => {
  it('emits one resource.exchanged event for a selected trade', () => {
    const player = createMockPlayer({ sheep: 2, food: 0 })
    player.improvements = ['Major_Fireplace1']
    const state = { players: [player], actionSpaces: [], workPhaseObtainedResources: {} } as unknown as GameState
    const capturedEvents: DraftGameEvent[] = []
    const result = anytimeExchangeAction.resolveChoice!(
      {
        state,
        player,
        space: { id: 'exchange' } as ActionSpace,
        eventSink: makeEventSink(capturedEvents),
      } as ActionMutationContext,
      'trade:0:2',
    )
    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([
      {
        type: 'resource.exchanged',
        paid: { sheep: 2 },
        gained: { food: 4 },
        paidFrom: { kind: 'player', playerId: 'p1' },
        paidTo: { kind: 'supply' },
        gainedFrom: { kind: 'supply' },
        gainedTo: { kind: 'player', playerId: 'p1' },
        exchangeSource: 'Major_Fireplace1',
        times: 2,
      },
    ])
  })

  it('does not emit resource.exchanged when exchange is cancelled', () => {
    const player = createMockPlayer({ sheep: 1 })
    player.improvements = ['Major_Fireplace1']
    const state = { players: [player], actionSpaces: [], workPhaseObtainedResources: {} } as unknown as GameState
    const capturedEvents: DraftGameEvent[] = []
    const result = anytimeExchangeAction.resolveChoice!(
      {
        state,
        player,
        space: { id: 'exchange' } as ActionSpace,
        eventSink: makeEventSink(capturedEvents),
      } as ActionMutationContext,
      'cancel',
    )
    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([])
  })

  it('does not emit resource.exchanged for zero-count bulk exchange', () => {
    const player = createMockPlayer({ sheep: 1 })
    player.improvements = ['Major_Fireplace1']
    const state = { players: [player], actionSpaces: [], workPhaseObtainedResources: {} } as unknown as GameState
    const capturedEvents: DraftGameEvent[] = []
    const result = anytimeExchangeAction.resolveChoice!(
      {
        state,
        player,
        space: { id: 'exchange' } as ActionSpace,
        eventSink: makeEventSink(capturedEvents),
      } as ActionMutationContext,
      'bulk:0=0',
    )
    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([])
  })

  it('passes the current exchange event to trade-applied listeners', () => {
    const player = createMockPlayer({ sheep: 2, food: 0 })
    player.improvements = ['Major_Fireplace1']
    const state = { players: [player], actionSpaces: [], workPhaseObtainedResources: {} } as unknown as GameState
    const capturedEvents: DraftGameEvent[] = []
    const sessionContext = new SessionCardContext()
    let observed = false
    sessionContext.registerListener({
      id: 'test-trade-applied-current-event',
      actions: ['trade-applied'],
      phases: ['immediatelyAfter'],
      handler: (context) => {
        observed = context.eventQuery.has('resource.exchanged', (event) =>
          (event.paid.sheep ?? 0) === 2 && (event.gained.food ?? 0) === 4,
        )
        expect(context.transactionEvents).toHaveLength(1)
      },
    })

    const result = withSessionContext(sessionContext, () =>
      anytimeExchangeAction.resolveChoice!(
        {
          state,
          player,
          space: { id: 'exchange' } as ActionSpace,
          eventSink: makeEventSink(capturedEvents),
        } as ActionMutationContext,
        'trade:0:2',
      ),
    )

    expect(result.type).toBe('ok')
    expect(observed).toBe(true)
  })
})
