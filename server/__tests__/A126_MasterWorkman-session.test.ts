import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A126_MasterWorkman'

const CARD_ID = 'A126_MasterWorkman'
const OTHER_OCCUPATION = 'A093_BedMaker'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, resources = {}, houseType = 'wood' as 'wood' | 'clay',
}: {
  played?: boolean
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone' | 'food', number>>
  houseType?: 'wood' | 'clay'
} = {}) => {
  const session = new GameSession(6126, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'sheep-market'
  state.roundActionOrder[1] = 'fencing'
  state.roundActionOrder[2] = 'lessons'
  state.roundActionOrder[3] = 'house-redevelopment'
  state.roundActionOrder[4] = 'pig-market'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.houseType = houseType
  Object.assign(player.resources, resources)
  for (const id of ['sheep-market', 'fencing', 'lessons', 'house-redevelopment', 'pig-market']) {
    const space = state.actionSpaces.find((candidate) => candidate.id === id)
    if (!space) throw new Error(`missing ${id}`)
    space.roundAvailable = 1
    space.takenBy = []
  }
  state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
  state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 1
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId = CARD_ID) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const renovate = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    response = session.resolveChoice(response.interaction.playerIndex, 'stone')
  }
  return response
}

describe('A126 Master Workman parity', () => {
  it('A126 S1: Master Workman is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A126 S2: using the round-one Sheep Market grants one wood before the action', () => {
    const response = setup().takeAction(0, 'sheep-market')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('A126 S3: using the round-two Fencing space grants one clay before fencing', () => {
    const session = setup({ resources: { wood: 4 } })
    let response = session.takeAction(0, 'fencing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(1)
    response = session.commitSelectionChoice(0, {
      edges: ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5'], palisadeEdges: [], extraWood: 0,
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1 })
  })

  it('A126 S4: using the round-three Lessons space grants one reed while playing an occupation', () => {
    const session = setup({ resources: { food: 1 } })
    const state = session.getState().state
    state.players[0]!.occupationHand = [OTHER_OCCUPATION]
    session.loadState(state)

    const response = playOccupation(session, OTHER_OCCUPATION)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OTHER_OCCUPATION)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })

  it('A126 S5: one stone funds and completes clay-to-stone renovation', () => {
    const session = setup({
      houseType: 'clay', resources: { stone: 1, reed: 1 },
    })
    expect(session.getActionAvailability(0)['house-redevelopment']).toBe(true)

    const response = renovate(session)

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { stone: 0, reed: 0 },
    })
  })

  it('A126 S6: round-five and basic action spaces grant no building resource', () => {
    const roundFive = setup().takeAction(0, 'pig-market')
    expect(roundFive.ok, roundFive.error).toBe(true)
    expect(roundFive.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })

    const basic = setup().takeAction(0, 'day-laborer')
    expect(basic.ok, basic.error).toBe(true)
    expect(basic.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })
})
