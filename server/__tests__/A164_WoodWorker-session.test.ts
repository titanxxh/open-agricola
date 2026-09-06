import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A164_WoodWorker'

const CARD_ID = 'A164_WoodWorker'
const FILLER = '__test_placeholder__'

const setup = ({
  woodOnSpace = 3,
  woodInSupply = 0,
  actor = 0,
  played = true,
} = {}) => {
  const session = new GameSession(5164, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.wood = 0
    player.resources.food = 0
    player.resources.sheep = 0
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.pastures = []
    player.stableAnimals = {}
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.wood = woodInSupply
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = woodOnSpace
  forest.takenBy = []
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

const cardOption = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return undefined
  return response.interaction.request.options?.find((option) =>
    option.sourceCard === CARD_ID && option.value !== '__skip__')
}

const accept = (session: GameSession, response: SessionResponse) => {
  const option = cardOption(response)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.stateId === 'wait'
    ? response.interaction.playerIndex : 0, option!.value)
}

const keepSheepInHouse = (session: GameSession, response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    request: { kind: 'animal-reorg' },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  const house = response.interaction.request.zones.find((zone) => zone.id === 'house')
  expect(house?.capacity).toBeGreaterThanOrEqual(1)
  return session.resolveChoice(0, 'confirm', [{
    id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1,
  }] as unknown as Record<string, unknown>)
}

describe('A164 Wood Worker parity', () => {
  it('A164 S1: Wood Worker is played as the first occupation without paying food in a four-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A164 S2: after using Forest the owner may return one wood there for one sheep', () => {
    const session = setup()

    const response = keepSheepInHouse(session, accept(session, session.takeAction(0, 'forest')))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, sheep: 1 })
    expect(response.state.players[0]!.houseAnimalType).toBe('sheep')
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(1)
  })

  it('A164 S3: the exchange after using Forest may be declined', () => {
    const session = setup()
    let response = session.takeAction(0, 'forest')
    expect(cardOption(response)).toBeDefined()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, sheep: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(0)
  })

  it('A164 S4: an empty wood accumulation space can still trigger using wood already in supply', () => {
    const session = setup({ woodOnSpace: 0, woodInSupply: 1 })

    const response = keepSheepInHouse(session, accept(session, session.takeAction(0, 'forest')))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, sheep: 1 })
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(1)
  })

  it('A164 S5: a non-wood accumulation space does not trigger Wood Worker', () => {
    const session = setup()
    const state = session.getState().state
    const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')!
    clayPit.resources.clay = 2
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, sheep: 0 })
    expect(cardOption(response)).toBeUndefined()
  })

  it("A164 S6: an opponent taking wood does not trigger the owner's Wood Worker", () => {
    const session = setup({ actor: 1 })

    const response = session.takeAction(1, 'forest')

    expect(response.state.players[1]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(cardOption(response)).toBeUndefined()
  })
})
