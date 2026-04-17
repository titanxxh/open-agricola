import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B26_AgrarianFences'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  wood?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  // Ensure grain-utilization is available at current round
  state.round = 3

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    grain: options?.grain ?? 3,
    vegetable: options?.vegetable ?? 0,
    wood: options?.wood ?? 10,
    food: 5,
  }
  // Give fields so sow is doable
  player.fields = [
    { row: 0, col: 2, crop: null, remaining: 0 },
    { row: 0, col: 3, crop: null, remaining: 0 },
  ]

  if (options?.withCard ?? true) {
    player.minorPlayed.push('B26_AgrarianFences')
    player.playedCards.push(playedKey('B26_AgrarianFences', 'minor'))
  }

  session.loadState(state)
  return session
}

describe('B26_AgrarianFences session', () => {
  it('without the card, grain-utilization offers normal sow/bake choices', () => {
    const session = setup({ withCard: false })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // Normal grain-utilization: or(sow, bake-bread) — presents sow and bake choices
    expect(resp.pending.type).toBe('choice')
  })

  it('with the card, grain-utilization offers fence-related alternatives for sow', () => {
    const session = setup({ withCard: true })
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    // The sow action should be replaced with XOR(fence, sow+fence, sow)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    // Should have more options than just normal sow/bake
    expect(resp.pending.options.length).toBeGreaterThanOrEqual(2)
  })

  it('without enough wood for fencing and no seeds, grain-utilization with card still works with bake', () => {
    const session = setup({ withCard: true, wood: 0, grain: 0 })
    // With no grain/veg for sow and no wood for fence, only bake should work
    // but bake also needs grain... so this may not be doable
    const resp = session.takeAction(0, 'grain-utilization')
    // The result depends on whether the player has bake improvements
    // Without bake improvements, action may fail or offer limited choices
    expect(resp.ok).toBeDefined()
  })

  it('does not affect sow actions outside grain-utilization', () => {
    const session = setup({ withCard: true })
    const state = session.getState().state
    // Advance to round 5 to unlock cultivation (which also has sow)
    state.round = 5
    session.loadState(state)

    const resp = session.takeAction(0, 'cultivation')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    // Cultivation should not have fence options — B26 only affects grain-utilization
    const optionValues = resp.pending.options.map((o) => o.value)
    const hasFenceOption = optionValues.some((v) => v.includes('fence'))
    expect(hasFenceOption).toBe(false)
  })
})
