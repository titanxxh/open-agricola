import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { setWorkersAtHome } from '../../shared/game/player'

const CARD_ID = 'A143_Stonecutter'

// Touch the import so the listener side-effect remains referenced.
void A143_Stonecutter

describe('A143_Stonecutter session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 2,
      stone: 2,
      food: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)
    return session
  }

  it('reduces Major improvement stone cost by 1', () => {
    const session = setup()
    // Major_Basket base cost: 2 reed + 2 stone. With Stonecutter: 2 reed + 1 stone.
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    const basket = resp.interaction.options?.find((o) => o.value === 'major:Major_Basket')
    expect(basket).toBeDefined()

    resp = session.resolveChoice(0, basket!.value)

    // Drain any remaining payment choices
    let steps = 0
    while (resp.interaction.stateId === 'wait' && steps < 8) {
      steps++
      const next = resp.interaction.options?.find((o) => o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    // Paid 2 reed + 1 stone (instead of 2 reed + 2 stone) -> 1 stone left.
    expect(after.resources.reed).toBe(0)
    expect(after.resources.stone).toBe(1)
  })
})
