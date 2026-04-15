import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/D/D124_Emissary'

describe('D124_Emissary session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('D124_Emissary')
    player.resources.wood = 2
    player.resources.clay = 2
    player.resources.food = 5
    player.resources.stone = 0
    player.resources.reed = 0
    player.resources.grain = 0
    player.resources.vegetable = 0
    player.resources.sheep = 0
    player.resources.boar = 0
    player.resources.cattle = 0
    session.loadState(state)
    session.devPlayCard(0, 'D124_Emissary')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('place wood: pay 1 wood, gain 1 stone, stack contains wood', () => {
    const session = setup()
    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'D124-emissary-wood')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.wood).toBe(1) // 2 - 1
    expect(updatedPlayer.resources.stone).toBe(1) // 0 + 1
    expect(getCardStack(updatedPlayer, 'D124_Emissary')).toContain('wood')
  })

  it('wood listener not available after wood placed; clay still available', () => {
    const session = setup()
    enterActiveInteraction(session)

    const resp1 = session.takeAnytimeAction(0, 'D124-emissary-wood')
    expect(resp1.ok).toBe(true)

    const anytimeIds = resp1.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).not.toContain('D124-emissary-wood')
    expect(anytimeIds).toContain('D124-emissary-clay')
  })

  it('place clay after wood: stack has both wood and clay', () => {
    const session = setup()
    enterActiveInteraction(session)

    const resp1 = session.takeAnytimeAction(0, 'D124-emissary-wood')
    expect(resp1.ok).toBe(true)

    const resp2 = session.takeAnytimeAction(0, 'D124-emissary-clay')
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    expect(updatedPlayer.resources.wood).toBe(1)  // 2 - 1
    expect(updatedPlayer.resources.clay).toBe(1)   // 2 - 1
    expect(updatedPlayer.resources.stone).toBe(2)  // 0 + 1 + 1

    const stack = getCardStack(updatedPlayer, 'D124_Emissary')
    expect(stack).toContain('wood')
    expect(stack).toContain('clay')
  })

  it('not available for a good type the player does not have', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)

    // Player has 0 reed, 0 grain, 0 vegetable, 0 sheep, 0 boar, 0 cattle
    const anytimeIds = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(anytimeIds).toContain('D124-emissary-wood')
    expect(anytimeIds).toContain('D124-emissary-clay')
    expect(anytimeIds).toContain('D124-emissary-food')
    expect(anytimeIds).not.toContain('D124-emissary-reed')
    expect(anytimeIds).not.toContain('D124-emissary-grain')
    expect(anytimeIds).not.toContain('D124-emissary-vegetable')
    expect(anytimeIds).not.toContain('D124-emissary-sheep')
    expect(anytimeIds).not.toContain('D124-emissary-boar')
    expect(anytimeIds).not.toContain('D124-emissary-cattle')
  })
})
