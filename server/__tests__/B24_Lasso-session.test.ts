import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { ActionChoiceOption, Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B024_Lasso'

const CARD_ID = 'B024_Lasso'
const FILLER = '__test_placeholder__'
const MARKET_SPACES = ['sheep-market', 'pig-market', 'cattle-market']

const resources = (values: Partial<Resource> = {}): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
  sheep: 0, boar: 0, cattle: 0, begging: 0, ...values,
})

const setup = ({ played = true, reed = 1 } = {}) => {
  const session = new GameSession(5224, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources = resources({ reed, food: 20 })
  player.pastures = [{
    id: 'p1',
    size: 4,
    tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
    stables: 1,
    animalType: null,
    animalCount: 0,
  }]
  for (const space of state.actionSpaces) {
    space.takenBy = []
    space.roundAvailable = Math.min(space.roundAvailable, 14)
  }
  state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
  state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 0
  state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 0
  state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle = 0
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playLasso = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const waitOptions = (response: SessionResponse): ActionChoiceOption[] => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return []
  expect(response.interaction.request.kind).toBe('choice')
  return response.interaction.request.options ?? []
}

const acceptLasso = (session: GameSession, response: SessionResponse) => {
  const accept = waitOptions(response).find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

const placedSpaces = (response: SessionResponse) => response.state.actionSpaces
  .filter((space) => space.takenBy.some((worker) => worker.playerId === 'p1'))
  .map((space) => space.id)
  .sort()

describe('B024 Lasso parity', () => {
  it('B024 S1: paying one reed plays Lasso', () => {
    const response = playLasso(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  it('B024 S2: without reed Lasso remains unavailable', () => {
    const response = setup({ played: false, reed: 0 }).takeAction(0, 'major-improvement')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('B024 S3: after a non-market placement Lasso restricts the second person to animal markets', () => {
    const session = setup()
    let response = session.takeAction(0, 'forest')

    response = acceptLasso(session, response)
    expect(waitOptions(response).map((option) => option.value)).toEqual(MARKET_SPACES)
    response = session.resolveChoice(0, 'sheep-market')

    expect(response.ok, response.error).toBe(true)
    expect(placedSpaces(response)).toEqual(['forest', 'sheep-market'])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
      ? response.interaction.request.options?.map((option) => option.value)
      : []).not.toContain('__skip__')
  })

  it('B024 S4: after an animal-market placement Lasso allows any legal second space', () => {
    const session = setup()
    let response = session.takeAction(0, 'sheep-market')

    response = acceptLasso(session, response)
    const options = waitOptions(response).map((option) => option.value)
    expect(options).toContain('forest')
    response = session.resolveChoice(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(placedSpaces(response)).toEqual(['forest', 'sheep-market'])
    expect(response.state.players[0]!.resources.wood).toBe(3)
  })

  it('B024 S5: declining Lasso keeps only the first placement', () => {
    const session = setup()
    const offered = session.takeAction(0, 'forest')

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(placedSpaces(response)).toEqual(['forest'])
  })

  it('B024 S6: a non-market placement offers no Lasso action when every animal market is occupied', () => {
    const session = setup()
    const state = session.getState().state
    MARKET_SPACES.forEach((spaceId, index) => {
      state.actionSpaces.find((space) => space.id === spaceId)!.takenBy = [
        { playerId: 'p2', workerId: state.players[1]!.workers[index]!.id },
      ]
    })
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(placedSpaces(response)).toEqual(['forest'])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
      ? response.interaction.request.options?.map((option) => option.value)
      : []).not.toContain('__skip__')
  })
})
