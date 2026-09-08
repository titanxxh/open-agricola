import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D049_Bookshelf'
import '../../shared/cards/A/A116_WoodCutter'

const CARD_ID = 'D049_Bookshelf'
const OCCUPATION_ID = 'A116_WoodCutter'
const FILLER = '__test_placeholder__'
const PLAYED_OCCUPATIONS = ['A100_Curator', 'A106_SlurrySpreader', 'A167_BreederBuyer']

const setup = ({
  played = true, occupations = 3, wood = 1, food = 0, owner = 0,
}: {
  played?: boolean
  occupations?: number
  wood?: number
  food?: number
  owner?: number
} = {}) => {
  const session = new GameSession(2049, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const actor = state.players[0]!
  const cardOwner = state.players[owner]!
  actor.occupationPlayed = PLAYED_OCCUPATIONS.slice(0, occupations)
  actor.occupationHand = [OCCUPATION_ID, FILLER]
  actor.resources.wood = wood
  actor.resources.food = food
  if (played) cardOwner.minorPlayed = [CARD_ID]
  else actor.minorHand = [CARD_ID, FILLER]
  for (const id of ['meeting-place', 'lessons', 'day-laborer']) {
    state.actionSpaces.find((space) => space.id === id)!.takenBy = []
  }
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playBookshelf = (session: GameSession) => {
  let response = enterMinorChoice(session)
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(OCCUPATION_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const occupation = options(response).find((option) => option.value === OCCUPATION_ID)
  if (occupation) response = session.resolveChoice(response.interaction.playerIndex, occupation.value)
  return response
}

describe('D049 Bookshelf session', () => {
  it('D049 S1: three occupations and one wood play Bookshelf', () => {
    const response = playBookshelf(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D049 S2: fewer than three occupations keep Bookshelf unavailable without paying wood', () => {
    const response = enterMinorChoice(setup({ played: false, occupations: 2 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('Bookshelf makes Lessons reachable at zero food without changing state during queries', () => {
    const session = setup()

    const before = JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })
    expect(session.getActionAvailability(0).lessons).toBe(true)
    expect(session.getActionAvailability(0).lessons).toBe(true)
    expect(JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })).toBe(before)
    const response = session.takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.occupationHand).not.toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('cannot keep Bookshelf food without playing an occupation, including after reconnect', () => {
    let session = setup()
    const initial = session.getState().state
    const initialCardStates = structuredClone(initial.players[0]!.cardStates)
    initial.players[0]!.occupationHand = [FILLER]
    session.loadState(initial)
    expect(session.getActionAvailability(0).lessons).toBe(true)
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('engine-blocked')
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[0]!.occupationPlayed).toEqual(PLAYED_OCCUPATIONS)
    const state = JSON.parse(JSON.stringify(session.state))
    const cursor = session.createSessionPrivateCursor()
    session = new GameSession(2049, undefined, { playerCount: 2 })
    session.loadState(state)
    session.restoreSessionPrivateCursor(cursor)
    expect(session.getState().interaction.request.kind).toBe('engine-blocked')
    expect(session.takeAction(0, 'forest').ok).toBe(false)
    expect(session.takeAnytimeAction(0, 'exchange').ok).toBe(false)
    response = session.undoAction(0)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'lessons')!.takenBy).toEqual([])
    expect(response.state.players[0]!.cardStates).toEqual(initialCardStates)
  })

  it('D049 S4: a Bookshelf owned by another player does not trigger for the acting player', () => {
    const response = playOccupation(setup({ owner: 1, food: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources.food).toBe(0)
  })

  it('D049 S5: a non-occupation action does not trigger Bookshelf', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })
})
