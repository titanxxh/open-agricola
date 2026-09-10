import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C052_HuntsmansHat'

const CARD_ID = 'C052_HuntsmansHat'

const setup = ({
  played = true,
  actor = 0,
  boar = 0,
  sheep = 0,
  playerCount = 4,
}: {
  played?: boolean
  actor?: number
  boar?: number
  sheep?: number
  playerCount?: 4 | 5
} = {}) => {
  const session = new GameSession(52, undefined, { playerCount })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
    player.pastures = [{
      id: `pasture-${player.id}`, size: 1, tiles: [{ row: 0, col: 2 }],
      stables: 0, animalType: null, animalCount: 0,
    }]
  })

  const owner = state.players[0]!
  owner.minorHand = played ? ['__test_placeholder__'] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.improvements = ['Major_Fireplace1']
  owner.resources.reed = played ? 0 : 1

  const pigMarket = state.actionSpaces.find((space) => space.id === 'pig-market')
  const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
  if (!pigMarket || !sheepMarket) throw new Error('animal market space missing')
  pigMarket.resources.boar = boar
  sheepMarket.resources.sheep = sheep

  session.loadState(state)
  return session
}

const enterMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinorChoice(session)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(0, card.value)
  return response
}

const chooseAnimalMarket = (session: GameSession, suffix: 'sheep' | 'boar' | 'cattle') => {
  let response = session.takeAction(0, 'animal-market-56')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find(
    (candidate) => candidate.labelKey === `actions.animal-market-56.option-${suffix}`,
  )
  expect(option).toBeDefined()
  response = session.resolveChoice(0, option!.value)
  return response
}

const placeAnimals = (
  session: GameSession,
  response: SessionResponse,
  animalType: 'sheep' | 'boar' | 'cattle',
  animalCount: number,
) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'animal-reorg' },
  })
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'animal-reorg') return response
  const pasture = response.interaction.request.zones.find((zone) => zone.zoneType === 'pasture')
  expect(pasture).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', {
    zones: [{ ...pasture!, animalType, animalCount }],
  })
}

describe("C052 Huntsman's Hat parity", () => {
  it("C052 S1: a cooking improvement and one reed allow Huntsman's Hat to be played", () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  it("C052 S2: without a cooking improvement Huntsman's Hat remains unavailable", () => {
    const session = setup({ played: false })
    const state = session.getState().state
    state.players[0]!.improvements = []
    session.loadState(state)

    const response = enterMinorChoice(session)

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) =>
        option.value === CARD_ID || option.value === `minor:${CARD_ID}`) ?? false
      : false).toBe(false)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })

  it('C052 S3: taking two pigs from Pig Market also gains two food', () => {
    const session = setup({ boar: 2 })
    const response = placeAnimals(session, session.takeAction(0, 'pig-market'), 'boar', 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 2, food: 2 })
  })

  it('C052 S4: taking sheep from an action space gains no Huntsman Hat food', () => {
    const session = setup({ sheep: 2 })
    const response = placeAnimals(session, session.takeAction(0, 'sheep-market'), 'sheep', 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, food: 0 })
  })

  it('C052 S5: an opponent taking pigs gains no food for the Huntsman Hat owner', () => {
    const session = setup({ actor: 1, boar: 2 })
    const response = placeAnimals(session, session.takeAction(1, 'pig-market'), 'boar', 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ boar: 2, food: 0 })
  })

  it('C052 S6: Animal Market sheep grants its printed one food and no Hat bonus', () => {
    const session = setup({ playerCount: 5 })
    const response = placeAnimals(session, chooseAnimalMarket(session, 'sheep'), 'sheep', 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 1 })
  })

  it('C052 S7: Animal Market pig also gains one Huntsman Hat food', () => {
    const session = setup({ playerCount: 5 })
    const response = placeAnimals(session, chooseAnimalMarket(session, 'boar'), 'boar', 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 1, food: 1 })
  })

  it('C052 S8: Animal Market cattle costs one food and grants no Hat bonus', () => {
    const session = setup({ playerCount: 5 })
    const state = session.getState().state
    state.players[0]!.resources.food = 1
    session.loadState(state)

    const response = placeAnimals(session, chooseAnimalMarket(session, 'cattle'), 'cattle', 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ cattle: 1, food: 0 })
  })
})
