import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A166_Haydryer'

const CARD_ID = 'A166_Haydryer'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, pastures = 1, food = 10, round = 4 } = {}) => {
  const session = new GameSession(5166, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    if (played || index !== 0) markAllWorkersUsed(state, player)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.resources.food = food
  player.resources.cattle = 0
  player.houseAnimalType = null
  player.houseAnimalCount = 0
  player.stableAnimals = {}
  player.pastures = Array.from({ length: pastures }, (_, index) => ({
    id: `haydryer-pasture-${index}`,
    size: 1,
    tiles: [{ row: index, col: 1 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }))
  if (!played) setWorkersAtHome(state, player, 2)
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const acceptHaydryer = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    candidate.sourceCard === CARD_ID && candidate.value !== '__skip__')
    ?? response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const placeCattle = (session: GameSession, response: SessionResponse, pastures: number) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    return response
  }
  const zone = pastures > 0
    ? response.interaction.request.zones.find((candidate) => candidate.id === 'haydryer-pasture-0')
    : response.interaction.request.zones.find((candidate) => candidate.zoneType === 'house')
  expect(zone).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', {
    zones: [{ ...zone!, animalType: 'cattle', animalCount: 1 }],
  })
}

describe('A166 Haydryer parity', () => {
  it('A166 S1: Haydryer is played as the first occupation without paying food in a four-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(10)
  })

  it('A166 S2: zero through three pastures reduce the cattle price from four food to one', () => {
    for (let pastures = 0; pastures <= 3; pastures++) {
      const session = setup({ pastures, food: 10 })

      let response = acceptHaydryer(session, session.performRoundEnd())

      expect(response.state.players[0]!.resources.food, `${pastures} pastures`).toBe(10 - (4 - pastures))
      expect(response.state.players[0]!.resources.cattle, `${pastures} pastures`).toBe(1)
      response = placeCattle(session, response, pastures)
      const player = response.state.players[0]!
      expect(player.resources.food, `${pastures} pastures after feeding`).toBe(10 - (4 - pastures) - 4)
      expect(player.houseAnimalCount + player.pastures.reduce((sum, pasture) =>
        sum + pasture.animalCount, 0)).toBe(1)
    }
  })

  it('A166 S3: a positive-cost cattle purchase may be declined', () => {
    const session = setup({ pastures: 2, food: 10 })
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(6)
  })

  it('A166 S4: with only two food a three-food Haydryer purchase cannot complete', () => {
    const session = setup({ pastures: 1, food: 2 })
    let response = session.performRoundEnd()
    if (response.interaction.stateId === 'wait') response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, begging: 2 })
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
  })

  it('A166 S5: four pastures make the cattle gain mandatory and free', () => {
    const session = setup({ pastures: 4, food: 4 })

    let response = session.performRoundEnd()

    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, cattle: 1 })
    response = placeCattle(session, response, 4)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      animalType: 'cattle', animalCount: 1,
    })
  })

  it('A166 S6: a round without a harvest does not offer or grant cattle', () => {
    const response = setup({ pastures: 4, food: 10, round: 3 }).performRoundEnd()

    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.round).toBe(4)
  })
})
