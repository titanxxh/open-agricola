import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { isLegacyChoicePending } from './_helpers/legacy-confirms'

import '../../shared/cards/A/A123_FrameBuilder'
import '../../shared/cards/B/B109_PaperMaker'

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: 1,
    food: 0,
  }
  player.occupationPlayed = ['B109_PaperMaker']
  player.occupationHand = ['A123_FrameBuilder']

  session.loadState(state)
  return session
}

describe('B109_PaperMaker session', () => {
  it('makes lessons available when wood can cover the food cost via preview payment', () => {
    const resp = setup().getState()
    expect(resp.ok).toBe(true)
    expect(isLegacyChoicePending(resp)).toBe(false)
    expect(resp.actionAvailability?.lessons).toBe(true)
  })

  it('plays an occupation without surfacing the legacy PaperMaker prompt', () => {
    const session = setup()

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationHand).not.toContain('A123_FrameBuilder')
  })
})
