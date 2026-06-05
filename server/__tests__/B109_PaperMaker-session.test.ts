import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

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
  it('makes lessons available when wood can fund the before-occupation payoff', () => {
    const resp = setup().getState()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.actionAvailability?.lessons).toBe(true)
  })

  it('offers the BGA before-occupation pay/gain before paying the occupation cost', () => {
    const session = setup()

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationHand).not.toContain('A123_FrameBuilder')
  })

  it('gains food beyond the occupation cost when multiple occupations are already played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['B109_PaperMaker', 'A153_PigOwner']
    player.occupationHand = ['A123_FrameBuilder']
    player.resources = { ...player.resources, wood: 1, food: 0 }
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })
})
