import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B088_EstablishedPerson'

const CARD_ID = 'B088_EstablishedPerson'
const FILLER = '__test_placeholder__'
const ONE_CELL = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({
  rooms = 2, houseType = 'wood' as 'wood' | 'clay' | 'stone', wood = 0,
} = {}) => {
  const session = new GameSession(5088, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.rooms = rooms
  owner.roomTiles = Array.from({ length: rooms }, (_, row) => ({ row, col: 0 }))
  owner.houseType = houseType
  owner.occupationHand = [CARD_ID]
  owner.resources = {
    ...owner.resources, wood, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  return response
}

const skipFence = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.kind === 'choice'
    && response.interaction.request.options?.some((option) => option.value === '__skip__')) {
    return session.resolveChoice(response.interaction.playerIndex, '__skip__')
  }
  return response
}

describe('B088 Established Person parity', () => {
  it('B088 S1: playing in a two-room wood house renovates to clay for free', () => {
    const response = playOccupation(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 2, resources: { clay: 0, reed: 0 },
    })
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B088 S2: the optional fencing after renovation may be declined', () => {
    const session = setup({ wood: 4 })
    const response = skipFence(session, playOccupation(session))

    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

  it('B088 S3: accepting the optional fence action pays the normal wood cost', () => {
    const session = setup({ wood: 4 })
    let response = playOccupation(session)
    expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })

    response = session.commitSelectionChoice(0, { edges: ONE_CELL, palisadeEdges: [], extraWood: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('B088 S4: playing in a two-room clay house renovates to stone for free', () => {
    const response = playOccupation(setup({ houseType: 'clay' }))

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', rooms: 2, resources: { stone: 0, reed: 0 },
    })
  })

  it('B088 S5: a three-room house does not trigger renovation or fencing', () => {
    const response = playOccupation(setup({ rooms: 3, wood: 4 }))

    expect(response.state.players[0]).toMatchObject({ houseType: 'wood', rooms: 3 })
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

  it('B088 S6: a two-room stone house does not trigger renovation or fencing', () => {
    const response = playOccupation(setup({ houseType: 'stone', wood: 4 }))

    expect(response.state.players[0]).toMatchObject({ houseType: 'stone', rooms: 2 })
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})
