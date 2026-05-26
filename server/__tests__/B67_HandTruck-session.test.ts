import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import '../../shared/cards/B/B67_HandTruck'

const CARD_ID = 'B67_HandTruck'

const setupHandTruckBakeSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  player.occupationPlayed.push('B67_HandTruck')
  player.resources.grain = 1
  player.improvements.push('Major_Fireplace1')
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.takenBy = [{ playerId: player.id, workerId: '1' }]
  session.loadState(state)
  return { session, player }
}

describe('B67_HandTruck session', () => {
  it('accepting optional grain continues to the mandatory bake prompt', () => {
    const { session } = setupHandTruckBakeSession()

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toMatch(/^ui\.interactionBakeBread/)
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
  })

  it('skipping optional grain still continues to the mandatory bake prompt', () => {
    const { session } = setupHandTruckBakeSession()
    session.getState().state.players[0]!.resources.grain = 2

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.options?.some((option) => option.value === '__skip__')).toBe(true)

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toMatch(/^ui\.interactionBakeBread/)
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
  })
})
