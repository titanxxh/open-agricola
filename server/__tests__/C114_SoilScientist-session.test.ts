import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C114_SoilScientist'

const CARD_ID = 'C114_SoilScientist'
const FILLER = '__test_placeholder__'

type SpaceId = 'clay-pit' | 'western-quarry' | 'forest'
type Resource = 'wood' | 'clay' | 'stone'

const setup = ({
  spaceId = 'clay-pit' as SpaceId,
  paidResource = 1,
  pile = 3,
} = {}) => {
  const session = new GameSession(5114, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
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
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [CARD_ID]
  if (spaceId === 'clay-pit') owner.resources.stone = paidResource
  if (spaceId === 'western-quarry') owner.resources.clay = paidResource

  for (const space of state.actionSpaces) {
    space.takenBy = []
    space.resources.wood = 0
    space.resources.clay = 0
    space.resources.reed = 0
    space.resources.stone = 0
  }
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`missing action space ${spaceId}`)
  const collected: Resource = spaceId === 'clay-pit' ? 'clay'
    : spaceId === 'western-quarry' ? 'stone' : 'wood'
  space.resources[collected] = pile
  session.loadState(state)
  return session
}

const cardOption = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return undefined
  return response.interaction.request.options?.find((option) =>
    option.sourceCard === CARD_ID && option.value !== '__skip__')
}

const accept = (session: GameSession, response: SessionResponse) => {
  const option = cardOption(response)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  if (response.interaction.stateId !== 'wait' || !option) return response
  return session.resolveChoice(response.interaction.playerIndex, option.value)
}

const decline = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
  return session.resolveChoice(response.interaction.playerIndex, '__skip__')
}

const spaceResource = (response: SessionResponse, spaceId: SpaceId, resource: Resource) =>
  response.state.actionSpaces.find((space) => space.id === spaceId)!.resources[resource] ?? 0

describe('C114 Soil Scientist parity', () => {
  it('C114 S1: after taking clay the owner may return one stone for two grain', () => {
    const session = setup()

    const response = accept(session, session.takeAction(0, 'clay-pit'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, stone: 0, grain: 2 })
    expect(spaceResource(response, 'clay-pit', 'stone')).toBe(1)
  })

  it('C114 S2: the clay-space exchange may be declined', () => {
    const session = setup()

    const response = decline(session, session.takeAction(0, 'clay-pit'))

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, stone: 1, grain: 0 })
    expect(spaceResource(response, 'clay-pit', 'stone')).toBe(0)
  })

  it('C114 S3: without stone no clay-space exchange is executable', () => {
    const response = setup({ paidResource: 0 }).takeAction(0, 'clay-pit')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, stone: 0, grain: 0 })
    expect(cardOption(response)).toBeUndefined()
  })

  it('C114 S4: after taking stone the owner may return two clay for one vegetable', () => {
    const session = setup({ spaceId: 'western-quarry', paidResource: 2, pile: 2 })

    const response = accept(session, session.takeAction(0, 'western-quarry'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, clay: 0, vegetable: 1 })
    expect(spaceResource(response, 'western-quarry', 'clay')).toBe(2)
  })

  it('C114 S5: the stone-space exchange may be declined', () => {
    const session = setup({ spaceId: 'western-quarry', paidResource: 2, pile: 2 })

    const response = decline(session, session.takeAction(0, 'western-quarry'))

    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, clay: 2, vegetable: 0 })
    expect(spaceResource(response, 'western-quarry', 'clay')).toBe(0)
  })

  it('C114 S6: without two clay no stone-space exchange is executable', () => {
    const response = setup({
      spaceId: 'western-quarry', paidResource: 1, pile: 2,
    }).takeAction(0, 'western-quarry')

    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, clay: 1, vegetable: 0 })
    expect(cardOption(response)).toBeUndefined()
  })

  it('C114 S7: a wood accumulation space does not trigger Soil Scientist', () => {
    const response = setup({ spaceId: 'forest', pile: 3 }).takeAction(0, 'forest')

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 0, vegetable: 0 })
    expect(cardOption(response)).toBeUndefined()
  })
})
