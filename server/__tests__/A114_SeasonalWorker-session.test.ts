import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A114_SeasonalWorker'

const CARD_ID = 'A114_SeasonalWorker'

const setup = ({ round, inHand = false }: { round: number; inHand?: boolean }) => {
  const session = new GameSession(114, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources = { ...player.resources, food: 0, grain: 0, vegetable: 0 }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const chooseCrop = (session: GameSession, response: SessionResponse, crop: 'grain' | 'vegetable') => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    JSON.stringify(candidate.effectPreview).includes(`\"${crop}\":1`)
  )
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A114 Seasonal Worker parity', () => {
  it('A114 S1: playing Seasonal Worker through Lessons keeps the occupation in play', () => {
    const response = playOccupation(setup({ round: 1, inHand: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A114 S2: before round six Day Laborer adds one grain', () => {
    const response = setup({ round: 5 }).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 1, vegetable: 0 })
  })

  it('A114 S3: from round six Day Laborer can choose one grain', () => {
    const session = setup({ round: 6 })

    const response = chooseCrop(session, session.takeAction(0, 'day-laborer'), 'grain')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 1, vegetable: 0 })
  })

  it('A114 S4: from round six Day Laborer can choose one vegetable', () => {
    const session = setup({ round: 6 })

    const response = chooseCrop(session, session.takeAction(0, 'day-laborer'), 'vegetable')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 0, vegetable: 1 })
  })

  it('A114 S5: a non-Day-Laborer action grants no crop', () => {
    const response = setup({ round: 6 }).takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })
})
