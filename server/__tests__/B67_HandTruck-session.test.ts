import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B067_HandTruck'

const CARD_ID = 'B067_HandTruck'

const setupHandTruckBakeSession = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.resources.grain = 1
  player.improvements.push('Major_Fireplace1')
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.takenBy = [{ playerId: player.id, workerId: '1' }]
  session.loadState(state)
  return { session, player }
}

describe('B067_HandTruck session', () => {
  it('forces the grain gain when it is required to make baking doable', () => {
    const { session } = setupHandTruckBakeSession()
    session.state.players[0]!.resources.grain = 0
    session.state.players[0]!.resources.food = 0
    session.loadState(session.state)

    const resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
  })

  it('accepting optional grain continues to the mandatory bake prompt', () => {
    const { session } = setupHandTruckBakeSession()

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
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
    expect(resp.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    resp = session.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toMatch(/^ui\.interactionBakeBread/)
    expect(resp.interaction.sourceCard).not.toBe(CARD_ID)
  })

  it('does not offer grain before bake-bread without a bake provider', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 0
    player.improvements = []
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.takenBy = [{ playerId: player.id, workerId: '1' }]
    session.loadState(state)

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    const resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })
})
