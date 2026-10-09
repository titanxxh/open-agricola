import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { E155_Visionary_impl } from '../../shared/cards/E/E155_Visionary'
import {
  setActiveWorkerCount,
  setNewbornCount,
  familySize,
} from '../../shared/domain/player'
import type { ActionHookPhase, ActionHookResult } from '../../shared/actions/hooks'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

const CARD_ID = 'E155_Visionary'

const setup = (round: number) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = round

  const owner = state.players[0]!
  const opponent = state.players[1]!
  owner.occupationPlayed.push(CARD_ID)
  return { session, state, owner, opponent }
}

const findIsDoableListener = () =>
  E155_Visionary_impl.listeners.find((l) => l.phases?.includes('isDoable' as ActionHookPhase))

describe('E155 Visionary — isDoable listener', () => {
  it('blocks family-growth in round 5 when opponent has not grown (familySize === 2)', () => {
    const { state, owner, opponent } = setup(5)
    expect(familySize(opponent)).toBe(2) // initial / not grown

    const listener = findIsDoableListener()
    expect(listener).toBeDefined()
    const ctx = {
      state,
      player: owner,
      actionId: 'family-growth',
      phase: 'isDoable' as ActionHookPhase,
    } as unknown as CardListenerContext
    const result = listener!.handler(ctx) as ActionHookResult | undefined
    expect(result).toEqual({ doable: false })
  })

  it('allows family-growth in round 5 when opponent has grown (familySize === 3)', () => {
    const { state, owner, opponent } = setup(5)
    setActiveWorkerCount(opponent, 3)
    setNewbornCount(opponent, 0)
    expect(familySize(opponent)).toBe(3)

    const listener = findIsDoableListener()!
    const ctx = {
      state,
      player: owner,
      actionId: 'family-growth',
      phase: 'isDoable' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(listener.handler(ctx)).toBeUndefined()
  })

  it('allows family-growth in round 11 even when opponent has not grown', () => {
    const { state, owner, opponent } = setup(11)
    expect(familySize(opponent)).toBe(2)

    const listener = findIsDoableListener()!
    const ctx = {
      state,
      player: owner,
      actionId: 'family-growth',
      phase: 'isDoable' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(listener.handler(ctx)).toBeUndefined()
  })
})

describe('E155 Visionary — onBuy effect', () => {
  it('grants 1 stone + 1 vegetable + 2 boar when bought in round <= 4', () => {
    const { state } = setup(4)
    const onBuy = E155_Visionary_impl.effect.onBuy!
    const result = onBuy(state)
    expect(result).toBeTruthy()
    expect(result?.type).toBe('leaf')
    expect(result?.actionId).toBe('gain')
    expect(result?.params).toEqual({ stone: 1, vegetable: 1, boar: 2 })
    expect(result?.sourceCard).toBe(CARD_ID)
  })

  it('grants nothing when bought in round 5+', () => {
    const { state } = setup(5)
    const onBuy = E155_Visionary_impl.effect.onBuy!
    expect(onBuy(state)).toBeUndefined()
  })
})
