import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B019_MoldboardPlow'

const CARD_ID = 'B019_MoldboardPlow'

const setup = (stack: string[] = ['field', 'field']) => {
  const session = new GameSession(19, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 3
  const player = state.players[0]!
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  player.minorPlayed = [CARD_ID]
  player.cardStates = { ...player.cardStates, [CARD_ID]: { stack } }
  session.loadState(state)
  return session
}

const normalPlow = (session: GameSession) => {
  let response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.farm.farmType !== 'plow') {
    throw new Error('expected field selection')
  }
  response = session.commitSelectionChoice(0, {
    tile: response.interaction.request.farm.selectableTiles[0]!,
  })
  return response
}

describe('B019 Moldboard Plow parity', () => {
  it('B019 S1: playing Moldboard Plow stores two field tiles on the card', () => {
    const session = new GameSession(19, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 3
    state.availableMajorImprovements = []
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.occupationPlayed = ['__test_occupation__']
    player.resources.wood = 2
    session.loadState(state)

    const response = session.takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['field', 'field'])
  })

  it('B019 S2: accepting the Farmland bonus plows one extra field and consumes one tile', () => {
    const session = setup()
    let response = normalPlow(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.farm.farmType !== 'field') return

    response = session.commitSelectionChoice(0, {
      tile: response.interaction.request.farm.selectableTiles[0]!,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toHaveLength(1)
  })

  it('B019 S3: declining the Farmland bonus preserves both stored fields', () => {
    const session = setup()
    let response = normalPlow(session)

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toHaveLength(2)
  })

  it('B019 S4: an empty Moldboard Plow no longer offers an extra field', () => {
    const response = normalPlow(setup([]))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .toBe('confirm-next-player')
  })
})
