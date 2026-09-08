import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C165_GameCatcher'
import '../../shared/cards/A/A100_Curator'

const CARD_ID = 'C165_GameCatcher'
const FILLER = '__test_placeholder__'

const setup = ({ round = 1, food = 6, playerCount = 4 } = {}) => {
  const session = new GameSession(5165, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
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
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID]
  owner.resources.food = food
  owner.pastures = [
    {
      id: 'game-catcher-boar', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0,
      animalType: null, animalCount: 0,
    },
    {
      id: 'game-catcher-cattle', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
      animalType: null, animalCount: 0,
    },
  ]
  session.loadState(state)
  return session
}

const settleAnimals = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'animal-reorg') return response
  const zones = structuredClone(response.interaction.request.zones)
  const boar = zones.find((zone) => zone.id === 'game-catcher-boar')
  const cattle = zones.find((zone) => zone.id === 'game-catcher-cattle')
  expect(boar).toBeDefined()
  expect(cattle).toBeDefined()
  Object.assign(boar!, { animalType: 'boar', animalCount: 1 })
  Object.assign(cattle!, { animalType: 'cattle', animalCount: 1 })
  return session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
}

const playGameCatcher = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return settleAnimals(session, response)
}

const expectAnimals = (response: SessionResponse) => {
  const owner = response.state.players[0]!
  expect(owner.resources).toMatchObject({ boar: 1, cattle: 1 })
  expect(owner.pastures).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'game-catcher-boar', animalType: 'boar', animalCount: 1 }),
    expect.objectContaining({ id: 'game-catcher-cattle', animalType: 'cattle', animalCount: 1 }),
  ]))
}

describe('C165 Game Catcher parity', () => {
  it('C165 S1: in round one Game Catcher pays six food and gains one cattle and one boar', () => {
    const response = playGameCatcher(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expectAnimals(response)
  })

  for (const [round, cost] of [[4, 6], [5, 5], [8, 4], [10, 3], [12, 2], [14, 1]]) {
    it(`C165 S2 round ${round}: Game Catcher costs ${cost} food for the remaining harvests`, () => {
      const response = playGameCatcher(setup({ round, food: cost }))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.food).toBe(0)
      expectAnimals(response)
    })
  }

  it('C165 S3: insufficient food blocks the played Game Catcher until undoStep', () => {
    const session = setup({ round: 5, food: 4 })
    const state = session.getState().state
    state.players[0]!.occupationHand = [CARD_ID, 'A100_Curator']
    session.loadState(state)

    let response = session.takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    expect(response.ok).toBe(true)
    expect(response.interaction.request.kind).toBe('engine-blocked')
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    response = session.undoStep(0)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.occupationHand).toContain(CARD_ID)
    expect(response.state.players[0]!.occupationPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, boar: 0, cattle: 0 })
  })

  it('C165 S4: Game Catcher deducts only the current cost when extra food is available', () => {
    const response = playGameCatcher(setup({ round: 10, food: 8 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(5)
    expectAnimals(response)
  })

  it('C165 S5: a fixed three-player hand can still play Game Catcher', () => {
    const response = playGameCatcher(setup({ playerCount: 3 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expectAnimals(response)
  })
})
