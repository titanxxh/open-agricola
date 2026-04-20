import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C85_DenBuilder'

describe('C85_DenBuilder session', () => {
  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone'; grain?: number; food?: number }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('C85_DenBuilder')
    player.houseType = options?.houseType ?? 'clay'
    player.resources.grain = options?.grain ?? 2
    player.resources.food = options?.food ?? 5
    session.loadState(state)
    session.devPlayCard(0, 'C85_DenBuilder')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('available in clay house: pays grain+food, rooms increment, card flagged', () => {
    const session = setup({ houseType: 'clay', grain: 2, food: 5 })
    const state = session.getState().state
    const initialRooms = state.players[0]!.rooms

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'C85-den-builder-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.grain).toBe(1) // 2 - 1
    expect(updatedPlayer.resources.food).toBe(3)  // 5 - 2
    expect(updatedPlayer.rooms).toBe(initialRooms + 1)
    expect(isCardFlagged(updatedPlayer, 'C85_DenBuilder')).toBe(true)
  })

  it('available in stone house', () => {
    const session = setup({ houseType: 'stone', grain: 2, food: 5 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).toContain('C85-den-builder-anytime')
  })

  it('NOT available in wood house', () => {
    const session = setup({ houseType: 'wood', grain: 2, food: 5 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
  })

  it('NOT available after flagged (one-time)', () => {
    const session = setup({ houseType: 'clay', grain: 5, food: 10 })

    enterActiveInteraction(session)

    const resp1 = session.takeAnytimeAction(0, 'C85-den-builder-anytime')
    expect(resp1.ok).toBe(true)

    // Should no longer be available
    const anytimeIds = resp1.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
  })

  it('NOT available without enough grain', () => {
    const session = setup({ houseType: 'clay', grain: 0, food: 5 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
  })

  it('NOT available without enough food', () => {
    const session = setup({ houseType: 'clay', grain: 2, food: 1 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('C85-den-builder-anytime')
  })
})
