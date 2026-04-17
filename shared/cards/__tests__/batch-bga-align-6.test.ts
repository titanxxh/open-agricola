import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../E/E144_WaresSalesman'

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

describe('E144_WaresSalesman BGA-aligned groups', () => {
  const improvementListener = () => findListener('E144-wares-salesman-after-improvement')!
  const occupationListener = () => findListener('E144-wares-salesman-after-occupation')!

  const firePlay = (listener: any, cardId: string, actionId: string) => {
    const p1 = createPlayer('p1')
    p1.occupationPlayed = ['E144_WaresSalesman']
    const p2 = createPlayer('p2')
    const state = createState(p1, p2)
    return executeCardListener(listener, {
      state, player: p2, space: createSpace(actionId),
      actionId, phase: 'after',
      choice: cardId,
      ownerPlayer: p1,
    } as any)
  }

  it('Major_Pottery → clay + reed', () => {
    const r = firePlay(improvementListener(), 'Major_Pottery', 'improvement-any') as any
    expect(r?.flow?.params).toEqual({ clay: 1, reed: 1 })
  })
  it('Major_Basket → 2 reed', () => {
    const r = firePlay(improvementListener(), 'Major_Basket', 'improvement-any') as any
    expect(r?.flow?.params).toEqual({ reed: 2 })
  })
  it('E153 StoneSculptor (minor) → stone + reed', () => {
    const r = firePlay(improvementListener(), 'minor:E153_StoneSculptor', 'minor-improvement') as any
    expect(r?.flow?.params).toEqual({ stone: 1, reed: 1 })
  })
  it('A48 ShavingHorse occupation-play → wood + reed', () => {
    const r = firePlay(occupationListener(), 'A48_ShavingHorse', 'play-occupation') as any
    expect(r?.flow?.params).toEqual({ wood: 1, reed: 1 })
  })
  it('C55 Studio → xor over wood+reed, clay+reed, stone+reed', () => {
    const r = firePlay(improvementListener(), 'C55_Studio', 'improvement-any') as any
    expect(r?.flow?.type).toBe('xor')
    expect(r?.flow?.children?.length).toBe(3)
  })
  it('E54 Contraband → xor over all four groups', () => {
    const r = firePlay(improvementListener(), 'E54_Contraband', 'improvement-any') as any
    expect(r?.flow?.type).toBe('xor')
    expect(r?.flow?.children?.length).toBe(4)
  })
  it('Major_Fireplace1 → no trigger (animals, not building resources)', () => {
    const r = firePlay(improvementListener(), 'Major_Fireplace1', 'improvement-any')
    expect(r).toBeUndefined()
  })
  it('Major_Well → no trigger (not in any group)', () => {
    const r = firePlay(improvementListener(), 'Major_Well', 'improvement-any')
    expect(r).toBeUndefined()
  })
  it('E109 BraidMaker (reed-only group) → 2 reed', () => {
    const r = firePlay(improvementListener(), 'minor:E109_BraidMaker', 'minor-improvement') as any
    expect(r?.flow?.params).toEqual({ reed: 2 })
  })
})
