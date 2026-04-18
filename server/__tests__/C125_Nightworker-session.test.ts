import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionSpace, Resource } from '../../shared/game/types'

import '../../shared/cards/C/C125_Nightworker'

const CARD_ID = 'C125_Nightworker'

describe('C125_Nightworker session', () => {
  const setupSession = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return { session, state }
  }

  it('onRoundStart offers building resource from accumulation spaces when player has 0 of a type', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 5
    player.resources.reed = 3
    player.resources.stone = 2

    // Set up an accumulation space with wood
    const woodSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0,
    )
    if (woodSpace) {
      woodSpace.resources.wood = 3
    }

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onRoundStart!(state, player)
    if (woodSpace && woodSpace.resources.wood > 0) {
      expect(flow).toBeDefined()
      expect(flow!.type).toBe('xor')
      expect((flow as any).optional).toBe(true)
    }
  })

  it('onRoundStart returns undefined when player has all building resource types', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 1
    player.resources.clay = 1
    player.resources.reed = 1
    player.resources.stone = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart returns undefined when card not played', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.resources.wood = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart returns undefined when no accumulation spaces have resources of missing type', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 1
    player.resources.reed = 1
    player.resources.stone = 1

    // Clear all wood from accumulation spaces
    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
    })

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })
})
