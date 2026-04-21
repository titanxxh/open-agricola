import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/D/D87_MasterBuilder'

describe('D87_MasterBuilder session', () => {
  const setup = (options?: { rooms?: number }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('D87_MasterBuilder')
    player.resources.food = 10
    player.rooms = options?.rooms ?? 5
    session.loadState(state)
    session.devPlayCard(0, 'D87_MasterBuilder')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('available with 5 rooms → rooms becomes 6, card flagged', () => {
    const session = setup({ rooms: 5 })
    const state = session.getState().state
    const initialRooms = state.players[0]!.rooms

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'D87-master-builder-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.rooms).toBe(initialRooms + 1)
    expect(isCardFlagged(updatedPlayer, 'D87_MasterBuilder')).toBe(true)
  })

  it('NOT available with rooms < 5', () => {
    const session = setup({ rooms: 4 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('D87-master-builder-anytime')
  })

  it('NOT available after flagged (one-time)', () => {
    const session = setup({ rooms: 5 })

    enterActiveInteraction(session)

    const resp1 = session.takeAnytimeAction(0, 'D87-master-builder-anytime')
    expect(resp1.ok).toBe(true)

    // Should no longer be available
    const anytimeIds = resp1.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('D87-master-builder-anytime')
  })
})
