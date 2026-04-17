import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/E/E116_FirCutter'

const CARD_ID = 'E116_FirCutter'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('E116_FirCutter session', () => {
  it('onBuy: gains 1 food when card is played', () => {
    const listener = findListener('E116-fir-cutter-onbuy')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'meeting-place' } as any,
      actionId: 'play-occupation',
      phase: 'after',
      choice: CARD_ID,
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ food: 1 })
    }
  })

  it('onBuy: does not trigger for other occupation', () => {
    const listener = findListener('E116-fir-cutter-onbuy')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'meeting-place' } as any,
      actionId: 'play-occupation',
      phase: 'after',
      choice: 'A114_SeasonalWorker',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('gains 1 wood with 1st farmer on sheep-market', () => {
    const listener = findListener('E116-fir-cutter-after-animal-market')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 1) // 1 farmer placed (familySize - workersAvailable = 1)

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'sheep-market' } as any,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ wood: 1 })
    }
  })

  it('gains 1 wood with 2nd farmer on pig-market', () => {
    const listener = findListener('E116-fir-cutter-after-animal-market')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    setActiveWorkerCount(player, 3)
    setWorkersAtHome(state, player, 1) // 2 farmers placed

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'pig-market' } as any,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ wood: 1 })
    }
  })

  it('gains 2 wood with 3rd farmer on cattle-market', () => {
    const listener = findListener('E116-fir-cutter-after-animal-market')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    setActiveWorkerCount(player, 4)
    setWorkersAtHome(state, player, 1) // 3 farmers placed

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'cattle-market' } as any,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ wood: 2 })
    }
  })

  it('gains 2 wood with 4th farmer', () => {
    const listener = findListener('E116-fir-cutter-after-animal-market')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    setActiveWorkerCount(player, 5)
    setWorkersAtHome(state, player, 1) // 4 farmers placed

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'sheep-market' } as any,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ wood: 2 })
    }
  })

  it('gains 3 wood with 5th farmer', () => {
    const listener = findListener('E116-fir-cutter-after-animal-market')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    setActiveWorkerCount(player, 5)
    markAllWorkersUsed(state, player) // 5 farmers placed
    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'sheep-market' } as any,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ wood: 3 })
    }
  })

  it('does not trigger on non-animal-market spaces', () => {
    const listener = findListener('E116-fir-cutter-after-animal-market')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 1)
    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'forest' } as any,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does not trigger if card not played', () => {
    const listener = findListener('E116-fir-cutter-after-animal-market')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [] // Card not played
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 1)
    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'sheep-market' } as any,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
