import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import { recordActionSnapshot } from '../../shared/cards/helpers/action-snapshot'
import type { PlayerState } from '../../shared/contract/types'

import '../../shared/cards/B/B029_CookeryLesson'

const CARD_ID = 'B029_CookeryLesson'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setActionToken = (player: PlayerState, token: number) => {
  recordActionSnapshot(player, token)
}

describe('B029_CookeryLesson — per-action token tracking, not per-round', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    return { session, state, player }
  }

  it('lessons placement first, then cook in same action → 1 VP awarded on cook', () => {
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    expect(exchangeListener).toBeDefined()
    expect(placeListener).toBeDefined()

    const { state, player } = setup()
    setActionToken(player, 100)

    // 1) Place farmer on lessons → no VP yet (no cook stamp)
    let result = executeCardListener(placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeUndefined()
    expect(readCardExtraData<number>(player, CARD_ID, 'lessonsActionToken')).toBe(100)

    // 2) anytime-exchange (cook) in same action → VP
    result = executeCardListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.actionId).toBe('bonus-vp')
    }
  })

  it('cook first, then lessons in same action → 1 VP awarded on lessons', () => {
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 200)

    let result = executeCardListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeUndefined()

    result = executeCardListener(placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons-4' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
  })

  it('cook first, then lessons-3 in same action → 1 VP awarded on lessons', () => {
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 201)

    let result = executeCardListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeUndefined()

    result = executeCardListener(placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons-3' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
  })

  it('cook in action 100, lessons in action 101 → NO VP (per-action gating)', () => {
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()

    setActionToken(player, 100)
    executeCardListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    // Action token advances → next farmer placement
    setActionToken(player, 101)
    const result = executeCardListener(placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    // lessons stamp is now 101, cooked stamp is 100 — no match
    expect(result).toBeUndefined()
  })

  it('lessons alone (no cook) → no VP', () => {
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 300)

    const result = executeCardListener(placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('cook alone (no lessons) → no VP', () => {
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const { state, player } = setup()
    setActionToken(player, 400)

    const result = executeCardListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('multiple cook calls in same action with lessons stamped → only 1 VP (USED_ACTION_TOKEN dedup)', () => {
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 500)

    // First lessons placement (no VP yet)
    executeCardListener(placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    // First cook → VP awarded, USED_ACTION_TOKEN_KEY = 500
    let result = executeCardListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeDefined()

    // Second cook in same action → no VP (already used this action)
    result = executeCardListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('non-lessons place-farmer does not stamp lessonsActionToken', () => {
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 600)
    writeCardExtraData(player, CARD_ID, 'lessonsActionToken', -1)

    const result = executeCardListener(placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'forest' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeUndefined()
    expect(readCardExtraData<number>(player, CARD_ID, 'lessonsActionToken')).toBe(-1)
  })
})
