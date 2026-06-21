import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { playOccupationAction } from '../../shared/actions/effects/occupation'
import type { ActionExecutionContext } from '../../shared/contract/types'

const CARD_ID = 'B176_VillageIdiot'

const setup = () => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  session.loadState(state)
  return session
}

describe('B176 Village Idiot', () => {
  it('cannot be played when the player already has another occupation', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['A174_MasterHora']
    player.occupationHand = [CARD_ID]
    player.resources.food = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons-56-variable')

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.options?.some((option) => option.value === CARD_ID) ?? false).toBe(false)
  })

  it('blocks later ordinary occupation choices after it is played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.occupationHand = ['A174_MasterHora']
    player.resources.food = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons-56-variable')

    expect(resp.interaction.options?.some((option) => option.value === 'A174_MasterHora') ?? false).toBe(false)
    expect(resp.state.players[0]!.occupationPlayed).toEqual([CARD_ID])
    expect(resp.state.players[0]!.occupationHand).toContain('A174_MasterHora')
  })

  it('blocks card-effect free occupation paths after it is played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.occupationHand = ['A174_MasterHora']
    player.resources.food = 0
    session.loadState(state)

    const result = playOccupationAction.execute!({
      state,
      player,
      space: { id: 'lessons' },
      sourceCard: 'A97_Freshman',
      params: { exactCost: {} },
      actionContext: { trueAction: false },
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('ok')
    expect(player.occupationPlayed).toEqual([CARD_ID])
    expect(player.occupationHand).toContain('A174_MasterHora')
  })

  it('rewards the owner when an opponent uses Meeting Place', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.occupationPlayed = [CARD_ID]
    owner.resources.wood = 0
    owner.resources.food = 0
    opponent.minorHand = ['__test_placeholder__']
    session.loadState(state)

    const resp = session.takeAction(1, 'meeting-place')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })

  it('does not reward owner use or non-Meeting Place spaces', () => {
    const ownerSession = setup()
    let state = ownerSession.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.occupationPlayed = [CARD_ID]
    state.players[0]!.resources.wood = 0
    state.players[0]!.resources.food = 0
    ownerSession.loadState(state)

    const ownResp = ownerSession.takeAction(0, 'meeting-place')
    expect(ownResp.ok).toBe(true)
    expect(ownResp.state.players[0]!.resources.wood).toBe(0)
    expect(ownResp.state.players[0]!.resources.food).toBe(0)

    const otherSession = setup()
    state = otherSession.getState().state
    state.currentPlayerIndex = 1
    state.players[0]!.occupationPlayed = [CARD_ID]
    state.players[0]!.resources.wood = 0
    state.players[0]!.resources.food = 0
    otherSession.loadState(state)

    const otherResp = otherSession.takeAction(1, 'day-laborer')
    expect(otherResp.ok).toBe(true)
    expect(otherResp.state.players[0]!.resources.wood).toBe(0)
    expect(otherResp.state.players[0]!.resources.food).toBe(0)
  })
})
