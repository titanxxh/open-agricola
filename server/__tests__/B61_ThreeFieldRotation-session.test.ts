import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B61_ThreeFieldRotation'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'B61_ThreeFieldRotation'

describe('B61_ThreeFieldRotation session', () => {
  it('gains 3 food when player has grain field, vegetable field, and empty field', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 2, stacks: [] },
    ]

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 3 })
  })

  it('does NOT gain food if missing grain field', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 1, stacks: [] },
    ]

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('does NOT gain food if missing vegetable field', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [] },
    ]

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('does NOT gain food if missing empty field', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

})
