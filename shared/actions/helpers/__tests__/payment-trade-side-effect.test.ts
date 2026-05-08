import { describe, it, expect } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { applyTradeSideEffect } from '../../payment/internal'

const baseState = (food: number): GameState =>
  ({
    actionSpaces: [
      { id: 'traveling-players', resources: { food } } as never,
    ],
  } as unknown as GameState)

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Test',
  resources: {} as never,
  cardStates: {},
  pastures: [],
  stableAnimals: {},
  rooms: 2,
  workers: [],
  improvements: [],
  minorPlayed: [],
  occupationPlayed: [],
  ...overrides,
} as unknown as PlayerState)

describe('applyTradeSideEffect.drainSpace', () => {
  it('drains the requested resource from the named action space', () => {
    const state = baseState(5)
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'drainSpace', spaceId: 'traveling-players', resource: 'food' }, 2, 'B155_ArtTeacher')
    expect((state.actionSpaces[0] as { resources: { food: number } }).resources.food).toBe(3)
  })

  it('clamps drain at zero (does not go negative)', () => {
    const state = baseState(1)
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'drainSpace', spaceId: 'traveling-players', resource: 'food' }, 5, 'B155_ArtTeacher')
    expect((state.actionSpaces[0] as { resources: { food: number } }).resources.food).toBe(0)
  })

  it('is no-op when target space does not exist', () => {
    const state = baseState(3)
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'drainSpace', spaceId: 'nonexistent', resource: 'food' }, 1, 'B155_ArtTeacher')
    expect((state.actionSpaces[0] as { resources: { food: number } }).resources.food).toBe(3)
  })

  it('is no-op when times <= 0', () => {
    const state = baseState(3)
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'drainSpace', spaceId: 'traveling-players', resource: 'food' }, 0, 'B155_ArtTeacher')
    expect((state.actionSpaces[0] as { resources: { food: number } }).resources.food).toBe(3)
  })
})

describe('applyTradeSideEffect.bonusVp', () => {
  it('writes amount * times to cardStates[sourceCard].extraData.bonusVpEarned', () => {
    const state = baseState(0)
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'bonusVp', amount: 2 }, 3, 'E153_StoneSculptor')
    expect(player.cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBe(6)
  })

  it('initializes cardStates / extraData when missing', () => {
    const state = baseState(0)
    const player = makePlayer({ cardStates: undefined as never })
    applyTradeSideEffect(state, player, { type: 'bonusVp', amount: 1 }, 1, 'E153_StoneSculptor')
    expect(player.cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBe(1)
  })

  it('accumulates across multiple invocations (does not overwrite)', () => {
    const state = baseState(0)
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'bonusVp', amount: 1 }, 1, 'E153_StoneSculptor')
    applyTradeSideEffect(state, player, { type: 'bonusVp', amount: 1 }, 1, 'E153_StoneSculptor')
    expect(player.cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBe(2)
  })

  it('is no-op when times <= 0', () => {
    const state = baseState(0)
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'bonusVp', amount: 5 }, 0, 'E153_StoneSculptor')
    expect(player.cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBeUndefined()
  })
})

describe('applyTradeSideEffect.pushExtraDataValue', () => {
  it('pushes value into cardStates[sourceCard].extraData[key]', () => {
    const state = baseState(0)
    const player = makePlayer()
    applyTradeSideEffect(
      state,
      player,
      { type: 'pushExtraDataValue', sourceCard: 'C62_CookeryExtension', key: 'usedCookeryIds', value: 'Major_Fireplace1' },
      1,
      'C62_CookeryExtension',
    )
    expect(player.cardStates?.C62_CookeryExtension?.extraData?.usedCookeryIds).toEqual(['Major_Fireplace1'])
  })

  it('dedupes when same value is pushed twice', () => {
    const state = baseState(0)
    const player = makePlayer()
    const eff = {
      type: 'pushExtraDataValue' as const,
      sourceCard: 'C62_CookeryExtension',
      key: 'usedCookeryIds',
      value: 'Major_Fireplace1',
    }
    applyTradeSideEffect(state, player, eff, 1, 'C62_CookeryExtension')
    applyTradeSideEffect(state, player, eff, 1, 'C62_CookeryExtension')
    expect(player.cardStates?.C62_CookeryExtension?.extraData?.usedCookeryIds).toEqual(['Major_Fireplace1'])
  })

  it('appends a different value to existing list', () => {
    const state = baseState(0)
    const player = makePlayer()
    applyTradeSideEffect(
      state,
      player,
      { type: 'pushExtraDataValue', sourceCard: 'C62_CookeryExtension', key: 'usedCookeryIds', value: 'Major_Fireplace1' },
      1,
      'C62_CookeryExtension',
    )
    applyTradeSideEffect(
      state,
      player,
      { type: 'pushExtraDataValue', sourceCard: 'C62_CookeryExtension', key: 'usedCookeryIds', value: 'Major_CookingHearth1' },
      1,
      'C62_CookeryExtension',
    )
    expect(player.cardStates?.C62_CookeryExtension?.extraData?.usedCookeryIds).toEqual([
      'Major_Fireplace1',
      'Major_CookingHearth1',
    ])
  })

  it('no-op when times <= 0', () => {
    const state = baseState(0)
    const player = makePlayer()
    applyTradeSideEffect(
      state,
      player,
      { type: 'pushExtraDataValue', sourceCard: 'C62_CookeryExtension', key: 'usedCookeryIds', value: 'Major_Fireplace1' },
      0,
      'C62_CookeryExtension',
    )
    expect(player.cardStates?.C62_CookeryExtension).toBeUndefined()
  })
})
