import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D151_SpinDoctor'

describe('D151_SpinDoctor session', () => {
  it('offers occupied spaces but never Meeting Place for the extra person', () => {
    const session = new GameSession(42, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.occupationPlayed.push('D151_SpinDoctor')
    setWorkersAtHome(state, player, 2)

    const opponentId = state.players[1]!.id
    state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = opponentId
    state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = []
    session.loadState(state)

    let resp = session.takeAction(0, 'traveling-players')
    expect(resp.ok, resp.error).toBe(true)
    resp = session.resolveChoice(0, 'flow-0')
    expect(resp.ok, resp.error).toBe(true)
    resp = session.resolveChoice(0, 'flow-0')
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const choices = resp.interaction.request.options?.map((option) => option.value)
    expect(choices).toContain('allow-occupied:day-laborer')
    expect(choices).not.toContain('meeting-place')
    expect(choices).not.toContain('allow-occupied:meeting-place')

    resp = session.resolveChoice(0, 'allow-occupied:day-laborer')
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy).toHaveLength(2)
  })
})
