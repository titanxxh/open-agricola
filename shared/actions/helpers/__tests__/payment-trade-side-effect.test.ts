import { describe, it, expect } from 'vitest'
import type { GameState } from '../../../game/types'
import { applyTradeSideEffect } from '../payment'

const baseState = (food: number): GameState =>
  ({
    actionSpaces: [
      { id: 'traveling-players', resources: { food } } as never,
    ],
  } as unknown as GameState)

describe('applyTradeSideEffect.drainSpace', () => {
  it('drains the requested resource from the named action space', () => {
    const state = baseState(5)
    applyTradeSideEffect(state, { type: 'drainSpace', spaceId: 'traveling-players', resource: 'food' }, 2)
    expect((state.actionSpaces[0] as { resources: { food: number } }).resources.food).toBe(3)
  })

  it('clamps drain at zero (does not go negative)', () => {
    const state = baseState(1)
    applyTradeSideEffect(state, { type: 'drainSpace', spaceId: 'traveling-players', resource: 'food' }, 5)
    expect((state.actionSpaces[0] as { resources: { food: number } }).resources.food).toBe(0)
  })

  it('is no-op when target space does not exist', () => {
    const state = baseState(3)
    applyTradeSideEffect(state, { type: 'drainSpace', spaceId: 'nonexistent', resource: 'food' }, 1)
    expect((state.actionSpaces[0] as { resources: { food: number } }).resources.food).toBe(3)
  })

  it('is no-op when times <= 0', () => {
    const state = baseState(3)
    applyTradeSideEffect(state, { type: 'drainSpace', spaceId: 'traveling-players', resource: 'food' }, 0)
    expect((state.actionSpaces[0] as { resources: { food: number } }).resources.food).toBe(3)
  })
})
