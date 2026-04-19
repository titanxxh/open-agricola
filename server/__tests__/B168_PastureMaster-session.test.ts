import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/B/B168_PastureMaster'

const CARD_ID = 'B168_PastureMaster'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('B168_PastureMaster session', () => {
  const createBaseState = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return state
  }

  it('gains 2 food on renovate when no pastures with stables', () => {
    const listener = findListener('B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()

    const state = createBaseState()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = []

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'renovate-house' } as any,
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ food: 2 })
    }
  })

  it('gains 2 food + 1 sheep when pasture with stable has sheep', () => {
    const listener = findListener('B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()

    const state = createBaseState()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        stables: 1,
        animalType: 'sheep',
        animalCount: 2,
      },
    ]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'renovate-house' } as any,
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ food: 2, sheep: 1 })
    }
  })

  it('gains animals from multiple pastures with stables', () => {
    const listener = findListener('B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()

    const state = createBaseState()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        stables: 1,
        animalType: 'sheep',
        animalCount: 3,
      },
      {
        id: 'p2',
        size: 1,
        tiles: [{ row: 1, col: 2 }],
        stables: 1,
        animalType: 'boar',
        animalCount: 1,
      },
      {
        id: 'p3',
        size: 1,
        tiles: [{ row: 2, col: 2 }],
        stables: 0, // no stable
        animalType: 'cattle',
        animalCount: 2,
      },
    ]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'renovate-house' } as any,
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      // 2 food + 1 sheep (from p1 with stable) + 1 boar (from p2 with stable)
      // p3 has no stable, so no bonus cattle
      expect(result!.flow.params).toEqual({ food: 2, sheep: 1, boar: 1 })
    }
  })


  it('skips pastures with stables but no animals', () => {
    const listener = findListener('B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()

    const state = createBaseState()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        stables: 1,
        animalType: null,
        animalCount: 0,
      },
    ]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'renovate-house' } as any,
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      // Only 2 food, no animals since pasture is empty
      expect(result!.flow.params).toEqual({ food: 2 })
    }
  })
})
