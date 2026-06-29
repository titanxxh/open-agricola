import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'B167_StableSergeant'

describe('B167_StableSergeant session', () => {
  it('onBuy returns undefined when all three animals cannot be accommodated', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 2

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBuy offers the pay-for-animals flow when all three animals can be accommodated', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 2
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    player.stableTiles = [{ row: 2, col: 2 }]
    player.stableAnimals = {}

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player) as ActionFlow
    expect(flow).toBeDefined()
    expect(flow.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.optional).toBe(true)
    expect(seq.children[0]).toMatchObject({
      type: 'leaf',
      actionId: 'pay',
      params: { food: 2 },
      sourceCard: CARD_ID,
    })
    expect(seq.children[1]).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { sheep: 1, boar: 1, cattle: 1 },
      sourceCard: CARD_ID,
    })
  })
})
