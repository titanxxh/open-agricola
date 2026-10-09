import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D144_WaterWorker'

const CARD_ID = 'D144_WaterWorker'

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.occupationHand.push(CARD_ID)
  player.resources.food = 10
  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

describe('D144_WaterWorker session', () => {
  it('gains 1 reed after using day-laborer', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const initialReed = player.resources.reed
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // Day laborer gives food + WaterWorker gives 1 reed
    expect(updated.resources.reed).toBe(initialReed + 1)
  })

  it('gains 1 reed after using reed-bank', () => {
    const session = setup()
    const state = session.getState().state
    // Make sure reed-bank has some resources accumulated
    const reedBankSpace = state.actionSpaces.find(s => s.id === 'reed-bank')
    if (reedBankSpace) {
      reedBankSpace.resources.reed = 3
    }
    const player = state.players[0]!
    const initialReed = player.resources.reed
    session.loadState(state)

    const resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // Reed bank gives accumulated reed + WaterWorker gives 1 reed
    expect(updated.resources.reed).toBeGreaterThan(initialReed + 1)
  })
})

describe('D144 Water Worker parity', () => {
  const CARD_ID = 'D144_WaterWorker'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, resources = {},
  }: {
    played?: boolean
    resources?: Partial<{ clay: number; reed: number }>
  } = {}) => {
    const session = new GameSession(6144, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map((id) =>
      id === 'house-redevelopment' ? null : id)
    state.roundActionOrder[3] = 'house-redevelopment'
    state.actionSpaces.forEach((space) => {
      space.takenBy = []
      if (space.id === 'house-redevelopment') space.roundAvailable = 4
      if (space.id === 'fishing') space.resources = { ...space.resources, food: 2 }
      if (space.id === 'reed-bank') space.resources = { ...space.resources, reed: 2 }
    })
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
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources = { ...owner.resources, ...resources }
    session.loadState(state)
    return session
  }

  const renovateToClay = (session: GameSession): SessionResponse => {
    let response = session.takeAction(0, 'house-redevelopment')
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(response.interaction.playerIndex, 'clay')
    }
    return response
  }

  it('D144 S2: using Fishing gains its food and one additional reed', () => {
    const response = setup().takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 1 })
  })

  it('D144 S5: using the round-four House Redevelopment action gains one additional reed', () => {
    const response = renovateToClay(setup({ resources: { clay: 2, reed: 1 } }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { clay: 0, reed: 1 },
    })
  })

  it('D144 S6: using a non-target action grants no additional reed', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, reed: 0 })
  })
})
