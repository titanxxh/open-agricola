import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D151_SpinDoctor'

const CARD_ID = 'D151_SpinDoctor'

const setup = (workers = 2) => {
  const session = new GameSession(42, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  setWorkersAtHome(state, player, workers)
  session.loadState(state)
  return session
}

const chooseSpinDoctor = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.options?.some((option) => option.value === 'flow-0')).toBe(true)
  return session.resolveChoice(0, 'flow-0')
}

const enterExtraPlacement = (session: GameSession) => {
  let response = chooseSpinDoctor(session, session.takeAction(0, 'traveling-players'))
  response = chooseSpinDoctor(session, response)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  return response
}

const choicesOf = (response: SessionResponse) =>
  response.interaction.stateId === 'wait'
    ? response.interaction.request.options?.map((option) => option.value) ?? []
    : []

describe('D151 Spin Doctor native session', () => {
  it('offers an occupied normal space but excludes an empty Meeting Place', () => {
    const session = setup()
    const state = session.getState().state
    const opponent = state.players[1]!
    state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = [{
      playerId: opponent.id,
      workerId: opponent.workers[0]!.id,
    }]
    state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = []
    session.loadState(state)

    let response = enterExtraPlacement(session)
    expect(choicesOf(response)).toContain('allow-occupied:day-laborer')
    expect(choicesOf(response)).not.toContain('meeting-place')
    expect(choicesOf(response)).not.toContain('allow-occupied:meeting-place')

    response = session.resolveChoice(0, 'allow-occupied:day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy).toHaveLength(2)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
  })

  it('excludes an occupied Meeting Place', () => {
    const session = setup()
    const state = session.getState().state
    const opponent = state.players[1]!
    state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = [{
      playerId: opponent.id,
      workerId: opponent.workers[0]!.id,
    }]
    session.loadState(state)

    const response = enterExtraPlacement(session)

    expect(choicesOf(response)).not.toContain('meeting-place')
    expect(choicesOf(response)).not.toContain('allow-occupied:meeting-place')
  })

  it('allows declining the extra placement', () => {
    const session = setup()
    let response = chooseSpinDoctor(session, session.takeAction(0, 'traveling-players'))
    expect(choicesOf(response)).toContain('__skip__')

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
  })

  it('does not offer an extra placement after another action space', () => {
    const session = setup()

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(choicesOf(response)).not.toContain('flow-0')
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
  })

  it('does not offer an extra placement without another worker', () => {
    const session = setup(1)

    const response = session.takeAction(0, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(choicesOf(response)).not.toContain('flow-0')
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
  })
})
