import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Worker } from '../types'
import { markAllWorkersUsed } from '../../game/player'
import { familySize, workersAvailable, newbornCount } from '../../game/player'
import { holdWorkerOnCard, releaseWorkerFromCard } from '../../cards/helpers/card-held-workers'
import {
  activateSmallestInactive,
  activeWorkers,
  familySize,
  findFirstNewborn,
  isWorkerOnAnySpace,
  newbornCount,
  smallestAvailableWorker,
  workersAtHome,
  workersAvailable,
} from '../player'
import { mkActionSpace } from '../../cards/__tests__/fixtures'

const makeWorker = (id: string, isActive = true, isNewborn = false): Worker => ({ id, isActive, isNewborn })

const makePlayer = (workers: Worker[]): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: { wood: 0, clay: 0, stone: 0, reed: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 },
  familySize: workers.filter(w => w.isActive).length, rooms: 2, houseType: 'wood', fields: [], pastures: [],
  occupationPlayed: [], minorPlayed: [], majorPlayed: [], handMinor: [], handOccupation: [],
  cardStates: {}, startPlayer: true, hasBegged: false, begCount: 0,
  workers,
} as unknown as PlayerState)

const emptyState = (players: PlayerState[]): GameState => ({
  round: 1, roundPhase: 'work', currentPlayerIndex: 0, players,
  actionSpaces: [], log: [], roundStartSnapshot: null, roundActionOrder: [],
  gameSeed: 0, availableMajorImprovements: [], futureMeeples: [], pendingFutureMeeples: [],
  gameOver: false, workPhaseObtainedResources: {},
} as unknown as GameState)

describe('player helpers', () => {
  it('familySize counts active workers', () => {
    const p = makePlayer([makeWorker('1'), makeWorker('2'), makeWorker('3', false)])
    expect(familySize(p)).toBe(2)
  })

  it('newbornCount counts active newborns only', () => {
    const p = makePlayer([makeWorker('1'), makeWorker('2', true, true), makeWorker('3', false, true)])
    expect(newbornCount(p)).toBe(1)
  })

  it('activeWorkers returns active members sorted as stored', () => {
    const p = makePlayer([makeWorker('1'), makeWorker('2', false), makeWorker('3')])
    expect(activeWorkers(p).map(w => w.id)).toEqual(['1', '3'])
  })

  it('isWorkerOnAnySpace reports presence in takenBy', () => {
    const p = makePlayer([makeWorker('1')])
    const s = emptyState([p])
    s.actionSpaces = [mkActionSpace({ id: 'x', takenBy: [{ playerId: 'p1', workerId: '1' }] })]
    expect(isWorkerOnAnySpace(s, 'p1', '1')).toBe(true)
    expect(isWorkerOnAnySpace(s, 'p1', '2')).toBe(false)
  })

  it('workersAtHome excludes those currently on a space', () => {
    const p = makePlayer([makeWorker('1'), makeWorker('2')])
    const s = emptyState([p])
    s.actionSpaces = [mkActionSpace({ id: 'x', takenBy: [{ playerId: 'p1', workerId: '1' }] })]
    expect(workersAtHome(s, p).map(w => w.id)).toEqual(['2'])
    expect(workersAvailable(s, p)).toBe(1)
  })

  it('smallestAvailableWorker returns lowest-id at-home worker', () => {
    const p = makePlayer([makeWorker('1'), makeWorker('2'), makeWorker('3')])
    const s = emptyState([p])
    s.actionSpaces = [mkActionSpace({ id: 'x', takenBy: [{ playerId: 'p1', workerId: '1' }] })]
    expect(smallestAvailableWorker(s, p)?.id).toBe('2')
  })

  it('findFirstNewborn returns lowest-id active newborn', () => {
    const p = makePlayer([makeWorker('1'), makeWorker('2', true, true), makeWorker('3', true, true)])
    expect(findFirstNewborn(p)?.id).toBe('2')
  })

  it('activateSmallestInactive flips smallest inactive to active+newborn', () => {
    const p = makePlayer([makeWorker('1'), makeWorker('2'), makeWorker('3', false), makeWorker('4', false), makeWorker('5', false)])
    const activated = activateSmallestInactive(p)
    expect(activated?.id).toBe('3')
    expect(p.workers.find(w => w.id === '3')).toMatchObject({ isActive: true, isNewborn: true })
  })

  it('activateSmallestInactive returns null when family is full', () => {
    const p = makePlayer(Array.from({ length: 5 }, (_, i) => makeWorker(String(i + 1))))
    expect(activateSmallestInactive(p)).toBe(null)
  })

  it('workersAtHome excludes workers held on a card', () => {
    const p = makePlayer([makeWorker('1'), makeWorker('2')])
    const s = emptyState([p])
    holdWorkerOnCard(p, 'C22_BasketChair', '1')
    expect(workersAtHome(s, p).map((w) => w.id)).toEqual(['2'])
    releaseWorkerFromCard(p, 'C22_BasketChair')
    expect(workersAtHome(s, p).map((w) => w.id).sort()).toEqual(['1', '2'])
  })
})
