import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/A/A149_HouseArtist'
import '../../shared/cards/A/A150_Stagehand'

const FILLER = '__test_placeholder__'

const setup = (cardId: string, actor = 0, played = true) => {
  const session = new GameSession(7149, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  owner.resources.wood = 5
  owner.resources.reed = 2
  state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 3
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const chooseNonSkip = (session: GameSession, response: SessionResponse, label = '') => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.value !== '__skip__' && (!label || candidate.labelKey?.includes(label))
  })
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const buildFirstRoom = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(response.interaction.playerIndex, {
    rooms: [response.interaction.request.farm.selectableTiles[0]!],
  })
}

describe('A149 House Artist parity', () => {
  it('A149 S1: House Artist can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A149_HouseArtist', 0, false), 'A149_HouseArtist')
      .state.players[0]!.occupationPlayed).toContain('A149_HouseArtist')
  })

  it('A149 S2: using Traveling Players may build a wooden room for five wood and one reed', () => {
    const session = setup('A149_HouseArtist')
    let response = session.takeAction(0, 'traveling-players')
    response = chooseNonSkip(session, response)
    response = buildFirstRoom(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 1 })
  })

  it('A149 S3: the House Artist room action may be declined', () => {
    const session = setup('A149_HouseArtist')
    const response = session.takeAction(0, 'traveling-players')
    expect(response.interaction.stateId).toBe('wait')
    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.state.players[0]!.rooms).toBe(2)
    expect(declined.state.players[0]!.resources).toMatchObject({ wood: 5, reed: 2 })
  })

  it('A149 S4: an opponent using Traveling Players grants no House Artist action', () => {
    const response = setup('A149_HouseArtist', 1).takeAction(1, 'traveling-players')
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A149_HouseArtist').toBe(true)
  })
})

describe('A150 Stagehand parity', () => {
  it('A150 S1: Stagehand can be played as the first occupation in a four-player game', () => {
    expect(playOccupation(setup('A150_Stagehand', 0, false), 'A150_Stagehand')
      .state.players[0]!.occupationPlayed).toContain('A150_Stagehand')
  })

  it('A150 S2: after an opponent uses Traveling Players the owner may build a room at normal cost', () => {
    const session = setup('A150_Stagehand', 1)
    let response = session.takeAction(1, 'traveling-players')
    response = confirmPlayerSwitch(session)
    response = chooseNonSkip(session, response, 'construct')
    response = buildFirstRoom(session, response)
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('A150 S3: the Stagehand bonus action may be declined', () => {
    const session = setup('A150_Stagehand', 1)
    let response = session.takeAction(1, 'traveling-players')
    response = confirmPlayerSwitch(session)
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, reed: 2 })
  })

  it('A150 S4: the owner using Traveling Players does not trigger Stagehand', () => {
    const response = setup('A150_Stagehand').takeAction(0, 'traveling-players')
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A150_Stagehand').toBe(true)
  })
})
