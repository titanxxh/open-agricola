import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/C/C141_SheepProvider'

describe('C141_SheepProvider session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.occupationPlayed.push('C141_SheepProvider')

    // Ensure sheep-market is the first round action (opens at round 1)
    state.roundActionOrder = state.roundActionOrder.map((id) =>
      id === 'sheep-market' ? null : id,
    )
    state.roundActionOrder[0] = 'sheep-market'

    // Ensure sheep-market has accumulated resources
    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market space missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)
    return session
  }

  it('owner gains 1 grain when opponent uses sheep-market', () => {
    const session = setup(1)
    const grainBefore = session.getState().state.players[0]!.resources.grain

    // Opponent takes sheep-market; sheep collection triggers animalReorg first
    let resp = session.takeAction(1, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('animalReorg')

    // Confirm animal reorg for opponent (p1) — engine finishes, after-hooks fire
    resp = session.confirmAnimalReorg(1, [])

    // After-hooks silently switch to owner, auto-gain grain, and switch back
    // Grain should be gained by owner (no confirmPlayerSwitch needed for auto-gains)
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('owner gains 1 grain when owner uses sheep-market themselves', () => {
    const session = setup(0)
    const grainBefore = session.getState().state.players[0]!.resources.grain

    // Owner takes sheep-market; sheep collection triggers animalReorg first
    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('animalReorg')

    // Confirm animal reorg for owner — engine finishes, after-hooks fire
    // No PlayerSwitch needed since owner triggered it
    resp = session.confirmAnimalReorg(0, [])

    // Grain should be gained by owner
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })
})
