import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionSpace } from '../../shared/game/types'

import '../../shared/cards/C/C125_Nightworker'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C125_Nightworker'

describe('C125_Nightworker session — BGA-aligned place-farmer flow', () => {
  const setupSession = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return { session, state }
  }

  it('onRoundStart returns optional place-farmer leaf with constraints when player has 0 of a building resource', () => {
    const { state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 5
    player.resources.reed = 3
    player.resources.stone = 2

    // Ensure at least one wood-accumulation space is set up unoccupied with
    // wood resource.
    const woodSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0,
    )
    if (!woodSpace) throw new Error('expected a wood accumulation space in default board')
    woodSpace.resources.wood = 3
    woodSpace.takenBy = []

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onRoundStart!(state, player) as ActionFlow | undefined
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    if (flow!.type !== 'leaf') return
    expect(flow!.actionId).toBe('place-farmer')
    expect(flow!.optional).toBe(true)
    expect(flow!.sourceCard).toBe(CARD_ID)
    const constraints = (flow!.actionContext as { constraints?: string[] } | undefined)?.constraints
    expect(Array.isArray(constraints)).toBe(true)
    expect(constraints).toContain(woodSpace.id)
  })

  it('onRoundStart returns undefined when player already has all building resource types', () => {
    const { state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 1
    player.resources.clay = 1
    player.resources.reed = 1
    player.resources.stone = 1

    const flow = getCardEffect(CARD_ID)!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart returns undefined when no candidate accumulation space has a missing-type resource', () => {
    const { state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 1
    player.resources.reed = 1
    player.resources.stone = 1

    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
    })

    const flow = getCardEffect(CARD_ID)!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart skips occupied accumulation spaces (uses standard place-farmer rules)', () => {
    const { state } = setupSession()
    const player = state.players[0]!
    const opponent = state.players[1]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 5
    player.resources.reed = 3
    player.resources.stone = 2

    // Mark every wood space as taken by opponent.
    let anyWood = false
    state.actionSpaces.forEach((s: ActionSpace) => {
      if ((s.gainPerRound.wood ?? 0) > 0) {
        s.resources.wood = 3
        s.takenBy = [{ playerId: opponent.id, workerId: 'w1' }]
        anyWood = true
      }
    })
    expect(anyWood).toBe(true)

    const flow = getCardEffect(CARD_ID)!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart returns undefined when player has no available worker', () => {
    const { state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.workers.forEach((w) => {
      w.isActive = false
    })

    const flow = getCardEffect(CARD_ID)!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })
})
