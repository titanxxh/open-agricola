import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/B/B49_Scales'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'B49_Scales'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('B49_Scales session', () => {
  const makePlayer = (minorPlayed: string[], occupationPlayed: string[], improvements: string[] = []) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed = minorPlayed
    player.occupationPlayed = occupationPlayed
    player.improvements = improvements
    return { state, player }
  }

  it('gains 2 food when occ count equals improvement count after playing occupation', () => {
    const listener = findListener('B49-scales-after-occupation')
    expect(listener).toBeDefined()

    // 1 occ played, 1 minor (Scales) → equal → gain 2 food
    const { state, player } = makePlayer([CARD_ID], ['STUB_OCC_1'])

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'play-occupation',
      phase: 'after',
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 2 })
  })

  it('does NOT gain food when counts differ after playing occupation', () => {
    const listener = findListener('B49-scales-after-occupation')
    expect(listener).toBeDefined()

    // 2 occ vs 1 minor → not equal → no food
    const { state, player } = makePlayer([CARD_ID], ['STUB_OCC_1', 'STUB_OCC_2'])

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'play-occupation',
      phase: 'after',
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('gains 2 food when counts match after playing improvement', () => {
    const listener = findListener('B49-scales-after-improvement')
    expect(listener).toBeDefined()

    // 2 occ, 2 minor (Scales + stub) → equal → gain 2 food
    const { state, player } = makePlayer(
      [CARD_ID, 'STUB_MINOR_1'],
      ['STUB_OCC_1', 'STUB_OCC_2'],
    )

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'play-improvement',
      phase: 'after',
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 2 })
  })

  it('does NOT gain food when counts differ after playing improvement', () => {
    const listener = findListener('B49-scales-after-improvement')
    expect(listener).toBeDefined()

    // 1 occ, 2 minor → not equal → no food
    const { state, player } = makePlayer(
      [CARD_ID, 'STUB_MINOR_1'],
      ['STUB_OCC_1'],
    )

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'play-improvement',
      phase: 'after',
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does NOT trigger for passing cards', () => {
    const listener = findListener('B49-scales-after-improvement')
    expect(listener).toBeDefined()

    // Counts are equal but card is passing
    const { state, player } = makePlayer([CARD_ID], ['STUB_OCC_1'])

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'play-improvement',
      phase: 'after',
      extraData: { passing: true },
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('counts major improvements in the improvement total', () => {
    const listener = findListener('B49-scales-after-occupation')
    expect(listener).toBeDefined()

    // 2 occ, 1 minor (Scales) + 1 major = 2 improvements total → equal → gain 2 food
    const { state, player } = makePlayer(
      [CARD_ID],
      ['STUB_OCC_1', 'STUB_OCC_2'],
      ['STUB_MAJOR'],
    )

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'play-occupation',
      phase: 'after',
    } as CardListenerContext)

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 2 })
  })
})
