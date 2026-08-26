import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { addWorkerRef } from '../../shared/domain/space'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import '../../shared/cards/E/E116_FirCutter'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'

const CARD_ID = 'E116_FirCutter'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const recordPlacements = (player: Parameters<typeof recordRoundPlacement>[0], count: number) => {
  for (let index = 0; index < count; index += 1) {
    recordRoundPlacement(player, `test-space-${index}`, String(index + 1))
  }
}

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
      space: mkActionSpace({ id: 'meeting-place' }),
      actionId: 'occupation',
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
      space: mkActionSpace({ id: 'meeting-place' }),
      actionId: 'occupation',
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
    setWorkersAtHome(state, player, 1)
    recordPlacements(player, 1)

    const result = executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'sheep-market' }),
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
    recordPlacements(player, 2)

    const result = executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'pig-market' }),
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

  it('does not count a newborn as an earlier placement', () => {
    const listener = findListener('E116-fir-cutter-after-animal-market')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    setActiveWorkerCount(player, 3)
    const workers = player.workers.filter((worker) => worker.isActive)
    workers[2]!.isNewborn = true
    const firstSpace = state.actionSpaces.find((space) => space.id === 'day-laborer')!
    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')!
    addWorkerRef(firstSpace, player.id, workers[0]!.id)
    addWorkerRef(sheepMarket, player.id, workers[1]!.id)
    recordRoundPlacement(player, firstSpace.id, workers[0]!.id)
    recordRoundPlacement(player, sheepMarket.id, workers[1]!.id)

    const result = executeCardListener(listener!, {
      state,
      player,
      space: sheepMarket,
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ wood: 1 })
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
    recordPlacements(player, 3)

    const result = executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'cattle-market' }),
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
    recordPlacements(player, 4)

    const result = executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'sheep-market' }),
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
    recordPlacements(player, 5)
    const result = executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'sheep-market' }),
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
      space: mkActionSpace({ id: 'forest' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })

})
