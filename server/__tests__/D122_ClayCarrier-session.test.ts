import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D122_ClayCarrier'

describe('D122_ClayCarrier session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('D122_ClayCarrier')
    session.loadState(state)
    session.devPlayCard(0, 'D122_ClayCarrier')
    return session
  }

  /** Take farmland action to enter active interaction with a plow choice */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    // Should be in a choice state (plow select)
    expect(resp.interaction.stateId).toBe('farmSelect')
    return resp
  }

  it('card is registered as played after devPlayCard', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.occupationPlayed).toContain('D122_ClayCarrier')
  })

  it('onBuy returns a gain flow for 2 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'D122_ClayCarrier', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('gain')
    expect((flow as any).params).toEqual({ clay: 2 })
  })

  it('anytime action appears during active interaction with food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).toContain('D122-clay-carrier-anytime')
  })

  it('anytime action not available without enough food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 1 // Not enough (need 2)
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('D122-clay-carrier-anytime')
  })

  it('anytime exchange: pay 2 food, gain 2 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    player.resources.clay = 0
    session.loadState(state)

    enterActiveInteraction(session)

    // Execute anytime action
    const resp2 = session.takeAnytimeAction(0, 'D122-clay-carrier-anytime')
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(3) // 5 - 2
    expect(updatedPlayer.resources.clay).toBe(2) // 0 + 2
  })

  it('once per round: blocked after first use', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 10
    player.resources.clay = 0
    session.loadState(state)

    enterActiveInteraction(session)

    // Use anytime action first time
    const resp2 = session.takeAnytimeAction(0, 'D122-clay-carrier-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.food).toBe(8) // 10 - 2
    expect(resp2.state.players[0]!.resources.clay).toBe(2) // 0 + 2

    // Verify card is flagged
    expect(resp2.state.players[0]!.cardStates?.['D122_ClayCarrier']?.flagged).toBe(true)

    // Verify anytime action is no longer available
    const anytimeIds = resp2.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('D122-clay-carrier-anytime')
  })

  it('flag resets via onBeforeStartOfTurn hook', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Manually flag the card (simulating it was used this round)
    setCardFlag(player, 'D122_ClayCarrier', true)
    expect(isCardFlagged(player, 'D122_ClayCarrier')).toBe(true)

    // Run onBeforeStartOfTurn hook directly
    runCardEffectHook(state, player, 'D122_ClayCarrier', 'onBeforeStartOfTurn')

    // Flag should be cleared
    expect(isCardFlagged(player, 'D122_ClayCarrier')).toBe(false)
  })
})
