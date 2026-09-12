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
  it.each([5, 6])('currently retains the remaining occupation hand when played in a %i-player game', (playerCount) => {
    const session = new GameSession(176, undefined, { playerCount })
    const state = session.getState().state
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    state.currentPlayerIndex = 0
    state.players[0]!.occupationHand = [CARD_ID, 'A174_MasterHora', 'D172_PutcherMaker']
    state.players[0]!.resources.food = 4
    session.loadState(state)

    let response = session.takeAction(0, 'lessons')
    expect(response.ok).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    expect(response.interaction.request.options?.map((option) => option.value)).toContain(CARD_ID)
    response = session.resolveChoice(0, CARD_ID)
    expect(response.ok).toBe(true)
    expect(response.state.players).toHaveLength(playerCount)
    expect(response.state.players[0]!.occupationPlayed).toEqual([CARD_ID])
    expect(response.state.players[0]!.occupationHand).toEqual(['A174_MasterHora', 'D172_PutcherMaker'])
    expect(response.state.players[0]!.resources.food).toBe(4)
    expect(response.state.log.some((entry) => JSON.stringify(entry.params).includes(CARD_ID))).toBe(true)
  })

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
    const options = resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice'
      ? resp.interaction.request.options
      : []
    expect(options.some((option) => option.value === CARD_ID)).toBe(false)
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

    const options = resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice'
      ? resp.interaction.request.options
      : []
    expect(options.some((option) => option.value === 'A174_MasterHora')).toBe(false)
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
      sourceCard: 'A097_Freshman',
      params: { exactCost: {} },
      actionContext: { trueAction: false },
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('fail')
    expect(player.occupationPlayed).toEqual([CARD_ID])
    expect(player.occupationHand).toContain('A174_MasterHora')
  })

  it('blocks minors that provide an occupation after it is played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.minorHand = ['D025_WitchesDanceFloor']
    player.resources.food = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'minor-improvement')

    const options = resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice'
      ? resp.interaction.request.options
      : []
    expect(options.some((option) => option.value === 'D025_WitchesDanceFloor')).toBe(false)
    expect(resp.state.players[0]!.minorHand).toContain('D025_WitchesDanceFloor')
    expect(resp.state.players[0]!.extraOccupationsFromCards).toEqual([])
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
