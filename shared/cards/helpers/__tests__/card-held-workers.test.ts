import { describe, expect, it } from 'vitest'
import { emptyResources } from '../../../contract/state-constants'
import type { GameState, PlayerState } from '../../../contract/types'
import { availableWorkers, workersAvailable } from '../../../domain/player'
import {
  getCardHeldWorkerIds,
  getWorkerHeldOnCard,
  getWorkersHeldOnCard,
  holdWorkerOnCard,
  holdWorkersOnCard,
  releaseWorkerFromCard,
} from '../card-held-workers'

const makePlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    resources: { ...emptyResources },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: true, isNewborn: false },
    ],
    cardStates: {},
  }) as unknown as PlayerState

const makeState = (player: PlayerState): GameState =>
  ({
    players: [player],
    actionSpaces: [],
  }) as unknown as GameState

describe('card-held-workers', () => {
  it('supports holding multiple workers on a card and releasing them on return home', () => {
    const player = makePlayer()
    const state = makeState(player)

    expect(workersAvailable(state, player)).toBe(3)

    holdWorkersOnCard(player, 'CWM090_Honeymoon', ['1', '2'])
    expect(getWorkersHeldOnCard(player, 'CWM090_Honeymoon')).toEqual(['1', '2'])
    expect(getWorkerHeldOnCard(player, 'CWM090_Honeymoon')).toBe('1')
    expect([...getCardHeldWorkerIds(player)]).toEqual(['1', '2'])
    expect(availableWorkers(state, player).map((worker) => worker.id)).toEqual(['3'])
    expect(workersAvailable(state, player)).toBe(1)

    holdWorkerOnCard(player, 'C022_BasketChair', '3')
    expect([...getCardHeldWorkerIds(player)]).toEqual(['1', '2', '3'])
    expect(workersAvailable(state, player)).toBe(0)

    expect(releaseWorkerFromCard(player, 'CWM090_Honeymoon')).toBe('1')
    expect(getWorkersHeldOnCard(player, 'CWM090_Honeymoon')).toEqual([])
    expect(workersAvailable(state, player)).toBe(2)

    expect(releaseWorkerFromCard(player, 'C022_BasketChair')).toBe('3')
    expect(workersAvailable(state, player)).toBe(3)
  })
})
