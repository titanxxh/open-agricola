import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../D/D135_GardeningHeadOfficial'
import '../D/D136_AnimalActivist'
import '../E/E135_Pickler'
import '../E/E136_AnimalHusbandryWorker'
import '../E/E154_Margrave'

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

const createState = (round: number, ...players: PlayerState[]): GameState =>
  ({
    round, phase: 'work', currentPlayerIndex: 0, players,
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

describe.each([
  { id: 'D135_GardeningHeadOfficial' },
  { id: 'D136_AnimalActivist' },
  { id: 'E136_AnimalHusbandryWorker' },
])('$id onBuy wood income (3/6/9 thresholds)', ({ id }) => {
  it('gives 4 wood when 9+ rounds left (round 5)', () => {
    const effect = getCardEffect(id)!
    const player = createPlayer()
    const state = createState(5, player)
    const flow = effect.onBuy!(state, player) as any
    const leaf = flow?.type === 'seq' ? flow.children[0] : flow
    expect(leaf?.params).toEqual({ wood: 4 })
  })
  it('gives 3 wood when 6-8 rounds left (round 8)', () => {
    const effect = getCardEffect(id)!
    const player = createPlayer()
    const state = createState(8, player)
    const flow = effect.onBuy!(state, player) as any
    const leaf = flow?.type === 'seq' ? flow.children[0] : flow
    expect(leaf?.params).toEqual({ wood: 3 })
  })
  it('gives 2 wood when 3-5 rounds left (round 11)', () => {
    const effect = getCardEffect(id)!
    const player = createPlayer()
    const state = createState(11, player)
    const flow = effect.onBuy!(state, player) as any
    const leaf = flow?.type === 'seq' ? flow.children[0] : flow
    expect(leaf?.params).toEqual({ wood: 2 })
  })
  it('gives nothing when fewer than 3 rounds left (round 12)', () => {
    const effect = getCardEffect(id)!
    const player = createPlayer()
    const state = createState(12, player)
    const flow = effect.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })
})

describe('E135_Pickler onBuy wood income (1/3/6/9 thresholds)', () => {
  it('gives 1 wood when 1-2 rounds left (round 13)', () => {
    const effect = getCardEffect('E135_Pickler')!
    const player = createPlayer()
    const state = createState(13, player)
    const flow = effect.onBuy!(state, player) as any
    expect(flow?.params).toEqual({ wood: 1 })
  })
  it('gives 2 wood at 3 rounds left (round 11)', () => {
    const effect = getCardEffect('E135_Pickler')!
    const flow = effect.onBuy!(createState(11, createPlayer()), createPlayer()) as any
    expect(flow?.params).toEqual({ wood: 2 })
  })
  it('gives 4 wood at 9 rounds left (round 5)', () => {
    const effect = getCardEffect('E135_Pickler')!
    const flow = effect.onBuy!(createState(5, createPlayer()), createPlayer()) as any
    expect(flow?.params).toEqual({ wood: 4 })
  })
  it('gives nothing when no rounds left (round 14)', () => {
    const effect = getCardEffect('E135_Pickler')!
    const flow = effect.onBuy!(createState(14, createPlayer()), createPlayer())
    expect(flow).toBeUndefined()
  })
})

describe('E136_AnimalHusbandryWorker onBuy includes optional fencing action', () => {
  it('returns seq: gain wood + optional fencing leaf', () => {
    const effect = getCardEffect('E136_AnimalHusbandryWorker')!
    const flow = effect.onBuy!(createState(5, createPlayer()), createPlayer()) as any
    expect(flow?.type).toBe('seq')
    expect(flow?.children?.length).toBe(2)
    expect(flow?.children?.[1]?.actionId).toBe('fencing')
    expect(flow?.children?.[1]?.optional).toBe(true)
  })
})

describe('E154_Margrave opponent-renovate listener', () => {
  it('owner in stone house gains 2 food when opponent renovates', () => {
    const listener = findListener('E154-margrave-opponent-renovate')!
    expect(listener.scope).toBe('opponent')
    const p1 = createPlayer('p1')
    p1.occupationPlayed = ['E154_Margrave']
    p1.houseType = 'stone'
    const p2 = createPlayer('p2')
    const state = createState(6, p1, p2)
    const result = executeCardListener(listener, {
      state, player: p1, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 2 })
    }
  })

  it('owner in wood house does not gain food', () => {
    const listener = findListener('E154-margrave-opponent-renovate')!
    const p1 = createPlayer('p1')
    p1.occupationPlayed = ['E154_Margrave']
    p1.houseType = 'wood'
    const p2 = createPlayer('p2')
    const state = createState(6, p1, p2)
    const result = executeCardListener(listener, {
      state, player: p1, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
      triggerPlayer: p2,
    } as any)
    expect(result).toBeUndefined()
  })
})
