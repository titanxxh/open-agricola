import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setCardFlag, isCardFlagged } from '../../shared/cards/helpers/card-state'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C150_ParrotBreeder'
import type { AnytimeAction } from '../../shared/game/types';

const CARD_ID = 'C150_ParrotBreeder'
const LISTENER_ID = 'C150-parrot-breeder-anytime'

describe('C150_ParrotBreeder session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    player.resources.grain = 3
    player.resources.food = 5
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('exposes an anytime action when the card is in play with at least 1 grain', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    setCardFlag(player, CARD_ID, false)
    player.resources.grain = 1
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain(LISTENER_ID)
  })

  it('anytime action is unavailable when already flagged (once-per-round)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    setCardFlag(player, CARD_ID, true)
    player.resources.grain = 3
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain(LISTENER_ID)
  })

  it('anytime action is unavailable without grain', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    setCardFlag(player, CARD_ID, false)
    player.resources.grain = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain(LISTENER_ID)
  })

  it('activating the anytime action pays and regains 1 grain (net zero) and flags the card', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    setCardFlag(player, CARD_ID, false)
    player.resources.grain = 2
    session.loadState(state)

    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, LISTENER_ID)
    expect(resp2.ok).toBe(true)

    const updated = resp2.state.players[0]!
    expect(updated.resources.grain).toBe(2) // paid 1, gained 1
    expect(isCardFlagged(updated, CARD_ID)).toBe(true)
  })

  it('onBeforeStartOfTurn resets the flag for the new round', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    setCardFlag(player, CARD_ID, true)
    const effect = getCardEffect(CARD_ID)
    effect!.onBeforeStartOfTurn!(state, player)
    expect(isCardFlagged(player, CARD_ID)).toBe(false)
  })
})
