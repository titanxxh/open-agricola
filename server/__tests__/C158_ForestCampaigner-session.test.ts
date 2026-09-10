import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B042_ForestInn'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C158_ForestCampaigner'
import '../../shared/cards/D/D170_FoldBuilder'

describe('C158 Forest Campaigner session', () => {
  it('opens a strict non-Farmland space when its food makes the action payable', () => {
    const session = new GameSession(42, undefined, { playerCount: 5 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 1
    const owner = state.players[0]!
    const user = state.players[1]!
    owner.occupationPlayed.push('D170_FoldBuilder')
    user.occupationPlayed.push('C158_ForestCampaigner')
    owner.resources.food = 0
    user.resources.food = 0
    user.resources.wood = 4
    for (const space of state.actionSpaces) {
      if (Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0)) {
        space.resources = { ...space.resources, wood: 0 }
      }
    }
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 8
    session.loadState(state)

    expect(session.getState().actionAvailability?.D170_FoldBuilder).toBe(true)
    const response = session.takeAction(1, 'D170_FoldBuilder')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[1]!.resources.food).toBe(0)
    expect(response.interaction.stateId).toBe('wait')
  })
})

describe('C158 Forest Campaigner parity', () => {
  const CARD_ID = 'C158_ForestCampaigner'

  const FOREST_INN = 'B042_ForestInn'

  const FILLER = '__test_placeholder__'

  const resetResources = () => ({
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, begging: 0,
  })

  const setup = ({
    played = true, wood = {}, forestInn = false,
  }: {
    played?: boolean
    wood?: Partial<Record<'forest' | 'grove' | 'copse' | 'day-laborer', number>>
    forestInn?: boolean
  } = {}) => {
    const session = new GameSession(6158, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => {
      space.takenBy = []
      if ((space.gainPerRound.wood ?? 0) > 0) space.resources.wood = 0
    })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = resetResources()
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    if (forestInn) {
      owner.resources.wood = 5
      state.players[1]!.minorHand = [FOREST_INN]
    }
    for (const [spaceId, amount] of Object.entries(wood)) {
      const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
      expect(space, `missing action space ${spaceId}`).toBeDefined()
      space!.resources.wood = amount
    }
    session.loadState(state)

    if (forestInn) {
      const response = session.devPlayCard(1, FOREST_INN)
      expect(response.ok, response.error).toBe(true)
      const updated = session.getState().state
      updated.currentPlayerIndex = 0
      updated.roundPhase = 'work'
      updated.actionSpaces.find((space) => space.id === FOREST_INN)!.takenBy = []
      session.loadState(updated)
    }
    return session
  }

  it('C158 S2: eight wood on one accumulation space gives one food before placement', () => {
    const response = setup({ wood: { forest: 8 } }).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  it('C158 S3: seven total wood gives no Forest Campaigner food', () => {
    const response = setup({ wood: { forest: 7 } }).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('C158 S4: wood is summed across all wood accumulation spaces', () => {
    const response = setup({
      wood: { forest: 3, grove: 3, copse: 2 },
    }).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  it('C158 S5: wood on a non-accumulation space does not count toward the threshold', () => {
    const response = setup({ wood: { 'day-laborer': 8 } }).takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
  })
})
