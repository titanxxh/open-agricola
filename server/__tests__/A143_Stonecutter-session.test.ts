import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { setWorkersAtHome } from '../../shared/domain/player'

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
    // Placeholder ids in BOTH players' hands: random minors dealt by
    // `new GameSession()` are non-deterministic across runs, which makes
    // `improvement-any` option counts flaky. Placeholder ids resolve to
    // undefined in `getMinorImprovement` and get filtered out of buyable
    // options, so only Major improvements remain as candidates.
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)
    return session
  }

  it('reduces Major improvement stone cost by 1', () => {
    const session = setup()
    // Major_Basket base cost: 2 reed + 2 stone. With Stonecutter: 2 reed + 1 stone.
    // With placeholder hands Major_Basket is the only affordable improvement
    // (player has reed=2, stone=2, wood=clay=food=0 — no other major fits).
    // `improvement-any` therefore auto-resolves the single option inside
    // takeAction, and the payment leaf also auto-resolves because the
    // typed-flat payment has exactly one solution.
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    // Paid 2 reed + 1 stone (instead of 2 reed + 2 stone) -> 1 stone left.
    expect(after.resources.reed).toBe(0)
    expect(after.resources.stone).toBe(1)
  })
})
