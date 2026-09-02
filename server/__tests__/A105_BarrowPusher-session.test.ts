import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A105_BarrowPusher'

const CARD_ID = 'A105_BarrowPusher'

const setup = (inHand = false) => {
  const session = new GameSession(105, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources.clay = 0
  player.resources.food = 0
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

const openFarmland = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected farm selection')
  expect(response.interaction.request.kind).toBe('farm-select')
  return response
}

describe('A105 Barrow Pusher parity', () => {
  it('A105 S1: playing Barrow Pusher through Lessons keeps the occupation in play', () => {
    const response = playOccupation(setup(true))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A105 S2: a legal new field grants one clay and one food', () => {
    const session = setup()
    const prompt = openFarmland(session)
    const tile = prompt.interaction.stateId === 'wait'
      ? prompt.interaction.request.farm.selectableTiles[0]
      : undefined
    expect(tile).toBeDefined()

    const response = session.commitSelectionChoice(0, { tile })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual(expect.objectContaining(tile!))
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 1 })
  })

  it('A105 S3: an occupied field target is rejected without Barrow Pusher resources', () => {
    const session = setup()
    openFarmland(session)
    const room = session.state.players[0]!.roomTiles[0]!

    const response = session.commitSelectionChoice(0, { tile: room })

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })
  })

  it('A105 S4: a non-plow action does not trigger Barrow Pusher', () => {
    const session = setup()

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 2 })
  })
})
