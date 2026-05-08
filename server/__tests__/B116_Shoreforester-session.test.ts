import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B116_Shoreforester'
import type { ActionFlow, ActionSpace, Resource } from '../../shared/contract/types'

const CARD_ID = 'B116_Shoreforester'

const ensureReedBank = (state: { actionSpaces: ActionSpace[] }, reed: number): void => {
  const space = state.actionSpaces.find((s) => s.id === 'reed-bank')
  if (!space) {
    state.actionSpaces.push({
      id: 'reed-bank',
      type: 'accumulation',
      resources: { wood: 0, clay: 0, reed, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 } as Resource,
      takenBy: [],
    } as unknown as ActionSpace)
    return
  }
  space.resources.reed = reed
}

const removeReedBank = (state: { actionSpaces: ActionSpace[] }): void => {
  state.actionSpaces = state.actionSpaces.filter((s) => s.id !== 'reed-bank')
}

describe('B116_Shoreforester session', () => {
  it('onBuy returns a gain-1-wood flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.wood).toBe(1)
  })

  it('onRoundStart: no reed-bank space → no wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 5

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    removeReedBank(state)

    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart: reed-bank empty → 1 wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 9

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    ensureReedBank(state, 0)

    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.wood).toBe(1)
  })

  it('onRoundStart: reed-bank has reed → no wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 9

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    ensureReedBank(state, 1)

    session.loadState(state)
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })
})
