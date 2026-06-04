import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { E109_BraidMaker } from '../../shared/cards/E/E109_BraidMaker'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'

import { setWorkersAtHome } from '../../shared/domain/player'
const CARD_ID = 'E109_BraidMaker'

// Keep side-effect imports referenced.
void A143_Stonecutter

/**
 * NOTE on `minorHand: []` in setups below:
 *
 * `runEngineSteps` auto-resolves any choice with exactly one option
 * (session-core.ts ~L2337). The default `new GameSession()` deals 7 random
 * minor cards to each player's hand; some of those minors are affordable
 * with `{reed:2,stone:3}`, others aren't. That randomness toggles the
 * `improvement-any` option count between 1 (only `Major_Basket`) and N
 * (`Major_Basket` + affordable minors), which in turn toggles between
 * "auto-resolve, action completes immediately" and "yield a wait choice".
 *
 * Forcing `minorHand: []` removes the random axis: `improvement-any` always
 * surfaces a single `Major_Basket` option, the engine always auto-resolves
 * it, and `takeAction` always returns with `Major_Basket` already bought.
 * Tests therefore assert post-purchase state directly (improvements +
 * resources) without a `resolveChoice` round-trip.
 */
describe('E109_BraidMaker session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      reed: 2,
      stone: 3,
      food: 0,
    }
    // Force "no buyable minor in hand" without triggering normalizeState's
    // re-deal path (which fires when any hand is empty). Placeholder ids
    // resolve to undefined in `getMinorImprovement` and get filtered out
    // of the option list.
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']

    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)
    return session
  }

  it('provides a harvest-time reed → food exchange', () => {
    // E109's exchange field enables 1 reed → 2 food exchange. We verify the
    // exchange registry returns this entry for the player.
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // The exchanges field is static metadata on the Occupation definition.
    expect(E109_BraidMaker.exchanges).toBeDefined()
    expect(E109_BraidMaker.exchanges?.[0]?.from?.reed).toBe(1)
    expect(E109_BraidMaker.exchanges?.[0]?.to?.food).toBe(2)
    expect(E109_BraidMaker.exchanges?.[0]?.max).toBe(1)
    // Guard: verify the card is still considered played by the player.
    expect(player.occupationPlayed).toContain(CARD_ID)
  })

  it('does not apply the basket discount without E109 played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = {
      ...player.resources,
      reed: 2,
      stone: 2,
      food: 0,
    }
    // Force "no buyable minor in hand" without triggering normalizeState's
    // re-deal path (which fires when any hand is empty). Placeholder ids
    // resolve to undefined in `getMinorImprovement` and get filtered out
    // of the option list.
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)

    // With minorHand=[] the only buyable improvement is Major_Basket;
    // single-option auto-resolve fires inside `takeAction`.
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    // No discount: full 2+2 base cost.
    expect(after.resources.reed).toBe(0)
    expect(after.resources.stone).toBe(0)
  })

  it('applies Basket discount when E109 is played (1 reed + 1 stone)', () => {
    const session = setup()
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    // E109 discount { reed: -1, stone: -1 }. Base { reed: 2, stone: 2 } -> { reed: 1, stone: 1 }.
    // Original resources: reed: 2, stone: 3. Paid 1 reed + 1 stone.
    expect(after.resources.reed).toBe(1)
    expect(after.resources.stone).toBe(2)
  })

  it('stacks E109 + A143 Stonecutter for Major_Basket', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = [CARD_ID, 'A143_Stonecutter']
    player.resources = {
      ...player.resources,
      reed: 2,
      stone: 2,
      food: 0,
    }
    // Force "no buyable minor in hand" without triggering normalizeState's
    // re-deal path (which fires when any hand is empty). Placeholder ids
    // resolve to undefined in `getMinorImprovement` and get filtered out
    // of the option list.
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    // E109: {reed:-1, stone:-1}. A143 improvement-any hook: {stone:-1}. Accumulated: {reed:-1, stone:-2}.
    // Applied to base {reed:2, stone:2} via applyCostOverride (with clamping) -> {reed:1, stone:0}.
    expect(after.resources.reed).toBe(1) // 2 - 1 = 1
    expect(after.resources.stone).toBe(2) // 2 - 0 (clamped at 0 payment)
  })
})
