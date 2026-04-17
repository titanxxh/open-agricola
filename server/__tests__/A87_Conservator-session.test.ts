import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/A/A87_Conservator'

const CARD_ID = 'A87_Conservator'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setup = (
  overrides: {
    houseType?: 'wood' | 'clay' | 'stone'
    rooms?: number
    resources?: Partial<Record<string, number>>
    playA87?: boolean
  } = {},
) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const owner = state.players[0]!
  if (overrides.playA87 !== false) {
    owner.occupationPlayed.push(CARD_ID)
    owner.playedCards.push(`occupation:${CARD_ID}`)
  }
  owner.houseType = overrides.houseType ?? 'wood'
  owner.rooms = overrides.rooms ?? 2
  if (overrides.resources) {
    Object.assign(owner.resources, overrides.resources)
  }

  session.loadState(state)
  return session
}

describe('A87_Conservator computeReplace listener', () => {
  it('declines and offers a wood->stone alternative when wooden house owner triggers renovate-house', () => {
    const session = setup({ houseType: 'wood', rooms: 2 })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-replace-renovate-house')
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeReplace',
    } as any)

    expect(result?.decline).toBe(true)
    expect(result?.sourceCard).toBe(CARD_ID)
    expect(result?.alternativeFlow).toEqual({
      type: 'leaf',
      actionId: 'renovate-house',
      params: { skipClayTier: true },
      sourceCard: CARD_ID,
      choiceLabelKey: 'ui.interactionConservatorDirectStone',
    })
  })

  it('is silent when the house is no longer wooden', () => {
    const session = setup({ houseType: 'clay' })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-replace-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeReplace',
    } as any)

    expect(result).toBeUndefined()
  })

  it('is silent when the player has not played A87', () => {
    const session = setup({ playA87: false })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-replace-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeReplace',
    } as any)

    expect(result).toBeUndefined()
  })

  it('is silent on the second pass to avoid replace loops', () => {
    const session = setup({ houseType: 'wood' })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-replace-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeReplace',
      actionContext: { checkedReplaceAction: true },
    } as any)

    expect(result).toBeUndefined()
  })
})

describe('A87_Conservator isDoable listener', () => {
  it('reports doable when wooden owner can afford the stone path', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1, clay: 0 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isdoable-renovate-house')
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    } as any)

    expect(result?.doable).toBe(true)
  })

  it('is silent when the action is already reported doable', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isdoable-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: true,
    } as any)

    expect(result).toBeUndefined()
  })

  it('is silent when the player cannot afford the stone path', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 1, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isdoable-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    } as any)

    expect(result).toBeUndefined()
  })

  it('is silent on non-wooden houses', () => {
    const session = setup({
      houseType: 'clay',
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isdoable-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: true,
    } as any)

    expect(result).toBeUndefined()
  })

  it('is silent when the player has not played A87', () => {
    const session = setup({
      playA87: false,
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('A87-conservator-isdoable-renovate-house')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    } as any)

    expect(result).toBeUndefined()
  })
})
