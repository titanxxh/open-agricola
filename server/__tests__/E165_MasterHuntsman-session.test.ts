import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E165_MasterHuntsman'

const CARD_ID = 'E165_MasterHuntsman'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('E165_MasterHuntsman session', () => {
  it('onBuy: gains 1 boar when card is played', () => {
    const listener = findListener('E165-master-huntsman-onbuy')
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
      expect(result!.flow.params).toEqual({ boar: 1 })
    }
  })

  it('onBuy: does not trigger for other occupation played', () => {
    const listener = findListener('E165-master-huntsman-onbuy')
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
      choice: 'A114_SeasonalWorker', // Different card
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('gains 1 boar after building a major improvement', () => {
    const listener = findListener('E165-master-huntsman-after-major')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'improvement-any' } as any,
      actionId: 'improvement-any',
      phase: 'after',
      choice: 'major:Major_Well',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ boar: 1 })
    }
  })

  it('does not trigger for minor improvement', () => {
    const listener = findListener('E165-master-huntsman-after-major')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'improvement-any' } as any,
      actionId: 'improvement-any',
      phase: 'after',
      choice: 'minor:A55_JunkRoom',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does not trigger if card not played', () => {
    const listener = findListener('E165-master-huntsman-after-major')
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed = [] // Card not played

    const result = executeCardListener(listener!, {
      state,
      player,
      space: { id: 'improvement-any' } as any,
      actionId: 'improvement-any',
      phase: 'after',
      choice: 'major:Major_Well',
      result: { type: 'ok' },
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
