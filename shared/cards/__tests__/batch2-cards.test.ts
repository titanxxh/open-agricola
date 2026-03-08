import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../B/B75_WoodWorkshop'
import '../A/A65_SeedPellets'
import '../C/C88_CarpentersApprentice'
import { C88_CarpentersApprentice as C88Card } from '../C/C88_CarpentersApprentice'

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

  it('has correct modifier definition', () => {
    const card = C88Card as any
    expect(card.modifier).toBeDefined()
    expect(card.modifier.type).toBe('bonus')
    expect(card.modifier.discount.wood).toBe(2)
    expect(card.modifier.appliesTo).toContain('construct')
  })
})
