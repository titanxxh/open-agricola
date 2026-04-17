import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'
import { buildHarvestFeedOptions } from '../../../src/app/hooks/use-harvest-flow'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
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

const createState = (playerCount: number, ...players: PlayerState[]): GameState => {
  const ps = players.length ? players : [createPlayer()]
  while (ps.length < playerCount) ps.push(createPlayer(`p${ps.length + 1}`))
  return ({
    round: 3, phase: 'work', currentPlayerIndex: 0, players: ps,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState
}

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

// Minimal test for harvest-trigger infrastructure. C59's actual exchange is added in Task 3.
describe('harvest trigger exchange infrastructure', () => {
  it('buildHarvestFeedOptions exists and returns an array', () => {
    const p = createPlayer()
    const opts = buildHarvestFeedOptions(p, 'en', (id) => id)
    expect(Array.isArray(opts)).toBe(true)
  })
  it('HarvestFeedOption type accepts optional max field', () => {
    const opt = { id: 'x', sourceName: 's', resourceKey: 'vegetable' as const, food: 5, max: 1 }
    expect(opt.max).toBe(1)
  })
})

// ===== Task 3: C59 SchnappsDistillery harvest exchange =====
import { C59_SchnappsDistillery } from '../C/C59_SchnappsDistillery'
import '../C/C59_SchnappsDistillery'

describe('C59_SchnappsDistillery harvest exchange', () => {
  it('declares a harvest exchange: 1 vegetable → 5 food, max 1', () => {
    const exchanges = (C59_SchnappsDistillery as any).exchanges
    expect(exchanges).toEqual([
      { from: { vegetable: 1 }, to: { food: 5 }, max: 1, trigger: 'harvest' },
    ])
  })

  it('appears in buildHarvestFeedOptions when player has vegetable and C59 played', () => {
    const p = createPlayer()
    p.minorPlayed = ['C59_SchnappsDistillery']
    p.resources.vegetable = 1
    const options = buildHarvestFeedOptions(p, 'en', (id) => id)
    const c59opt = options.find((o: any) => o.id.startsWith('C59_SchnappsDistillery-harvest'))
    expect(c59opt).toBeDefined()
    expect(c59opt!.food).toBe(5)
    expect(c59opt!.resourceKey).toBe('vegetable')
    expect(c59opt!.max).toBe(1)
  })

  it('does not appear when player has no vegetable', () => {
    const p = createPlayer()
    p.minorPlayed = ['C59_SchnappsDistillery']
    p.resources.vegetable = 0
    const options = buildHarvestFeedOptions(p, 'en', (id) => id)
    const c59opt = options.find((o: any) => o.id.startsWith('C59_SchnappsDistillery-harvest'))
    expect(c59opt).toBeUndefined()
  })
})

export { createPlayer, createState, createSpace, findListener, getCardEffect, executeCardListener }
