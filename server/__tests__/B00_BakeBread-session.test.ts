import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

const setupBakeChoiceSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    grain: 2,
    food: 0,
  }
  player.improvements = ['Major_Fireplace1', 'Major_ClayOven']
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  session.loadState(state)
  return session
}

describe('bake-bread session pending recovery', () => {
  it('keeps the bake choice pending after malformed bulk input', () => {
    const session = setupBakeChoiceSession()

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionBakeBreadChoice')
    expect(resp.interaction.request.options?.map((option) => option.value)).toEqual([
      'Major_Fireplace1',
      'Major_ClayOven',
    ])

    resp = session.resolveChoice(0, 'bulk:bad')

    expect(resp.ok).toBe(false)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionBakeBreadChoice')
    expect(resp.interaction.request.options?.map((option) => option.value)).toEqual([
      'Major_Fireplace1',
      'Major_ClayOven',
    ])
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(0)

    resp = session.resolveChoice(0, 'bulk:Major_Fireplace1=1,Major_ClayOven=1')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(7)
  })
})
