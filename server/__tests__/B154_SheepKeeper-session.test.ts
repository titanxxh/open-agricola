import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B154_SheepKeeper'

const CARD_ID = 'B154_SheepKeeper'

describe('B154_SheepKeeper session', () => {
  const setup = (sheep = 0) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    player.resources.sheep = sheep
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('not available with < 7 sheep', () => {
    const session = setup(6)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('B154-sheep-keeper-anytime')
  })

  it('available with 7 sheep, grants 3 VP + 2 food', () => {
    const session = setup(7)
    const state = session.getState().state
    const initialFood = state.players[0]!.resources.food

    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).toContain('B154-sheep-keeper-anytime')

    const resp2 = session.takeAnytimeAction(0, 'B154-sheep-keeper-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.cardStates?.B154_SheepKeeper?.counters?.bonusVp).toBe(3)
    expect(resp2.state.players[0]!.resources.food).toBe(initialFood + 2)
  })

  it('one-time only', () => {
    const session = setup(7)
    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'B154-sheep-keeper-anytime')
    expect(resp2.ok).toBe(true)
    expect(isCardFlagged(resp2.state.players[0]!, CARD_ID)).toBe(true)

    // Should no longer appear in anytime actions
    const anytimeIds = resp2.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('B154-sheep-keeper-anytime')
  })
})
