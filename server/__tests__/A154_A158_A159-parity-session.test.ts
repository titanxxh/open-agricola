import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/A/A154_Paymaster'
import '../../shared/cards/A/A158_CulinaryArtist'
import '../../shared/cards/A/A159_JoineroftheSea'

const FILLER = '__test_placeholder__'
type ResourceName = 'wood' | 'grain' | 'vegetable' | 'sheep'

const setup = (cardId: string, resources: Partial<Record<ResourceName, number>> = {}) => {
  const session = new GameSession(7159, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 1
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 1 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [cardId]
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const setupInHand = (cardId: string) => {
  const session = new GameSession(7159, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.occupationPlayed = []
    player.resources.food = 0
  })
  state.players[0]!.occupationHand = [cardId]
  session.loadState(state)
  return session
}

const playFirstOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const setAccumulation = (session: GameSession, spaceId: string) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.resources = { ...space.resources, ...(spaceId === 'reed-bank' ? { reed: 2 } : { food: 3 }) }
  space.takenBy = []
  session.loadState(state)
}

const switchToOwner = (session: GameSession, response: SessionResponse) => {
  while (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

const acceptReaction = (session: GameSession, response: SessionResponse) => {
  response = switchToOwner(session, response)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', playerIndex: 0, request: { kind: 'choice' },
  })
  if (response.interaction.stateId !== 'wait') throw new Error('expected card choice')
  const choice = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(choice).toBeDefined()
  return session.resolveChoice(0, choice!.value)
}

for (const cardId of ['A154_Paymaster', 'A158_CulinaryArtist', 'A159_JoineroftheSea']) {
  it(`${cardId.slice(0, 4)} S1: the occupation can be played as the first occupation in a four-player game`, () => {
    const response = playFirstOccupation(setupInHand(cardId), cardId)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(cardId)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
}

describe('A154 Paymaster parity', () => {
  it('A154 S2: after an opponent uses Fishing one grain may be given for one bonus point', () => {
    const session = setup('A154_Paymaster', { grain: 1 })
    setAccumulation(session, 'fishing')
    const response = acceptReaction(session, session.takeAction(1, 'fishing'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.cardStates.A154_Paymaster?.counters?.bonusVp).toBe(1)
  })

  it('A154 S3: the Paymaster exchange may be declined', () => {
    const session = setup('A154_Paymaster', { grain: 1 })
    setAccumulation(session, 'traveling-players')
    let response = switchToOwner(session, session.takeAction(1, 'traveling-players'))
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.cardStates.A154_Paymaster?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A154 S4: without grain no Paymaster exchange can occur', () => {
    const session = setup('A154_Paymaster')
    setAccumulation(session, 'fishing')
    const response = switchToOwner(session, session.takeAction(1, 'fishing'))
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.cardStates.A154_Paymaster?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('A158 Culinary Artist parity', () => {
  it.each([
    ['S2', 'grain', 4],
    ['S3', 'sheep', 5],
    ['S4', 'vegetable', 7],
  ] as const)('A158 %s: one %s may be exchanged for %i food', (_scenario, resource, food) => {
    const session = setup('A158_CulinaryArtist', { [resource]: 1 })
    setAccumulation(session, 'traveling-players')
    const response = acceptReaction(session, session.takeAction(1, 'traveling-players'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[resource]).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(food)
  })

  it('A158 S5: the Culinary Artist exchange may be declined', () => {
    const session = setup('A158_CulinaryArtist', { grain: 1 })
    setAccumulation(session, 'traveling-players')
    let response = switchToOwner(session, session.takeAction(1, 'traveling-players'))
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A158 S6: with none of the three goods no Culinary Artist exchange can occur', () => {
    const session = setup('A158_CulinaryArtist')
    setAccumulation(session, 'traveling-players')
    const response = switchToOwner(session, session.takeAction(1, 'traveling-players'))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'A158_CulinaryArtist').toBe(true)
  })
})

describe('A159 Joiner of the Sea parity', () => {
  it.each([
    ['S2', 'fishing', 2],
    ['S3', 'reed-bank', 3],
  ] as const)('A159 %s: after an opponent uses %s one wood may be given for %i food', (_scenario, spaceId, food) => {
    const session = setup('A159_JoineroftheSea', { wood: 1 })
    setAccumulation(session, spaceId)
    const response = acceptReaction(session, session.takeAction(1, spaceId))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food })
    expect(response.state.players[1]!.resources.wood).toBe(1)
  })

  it('A159 S4: the Joiner of the Sea exchange may be declined', () => {
    const session = setup('A159_JoineroftheSea', { wood: 1 })
    setAccumulation(session, 'fishing')
    let response = switchToOwner(session, session.takeAction(1, 'fishing'))
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(response.state.players[1]!.resources.wood).toBe(0)
  })

  it('A159 S5: without wood no Joiner of the Sea exchange can occur', () => {
    const session = setup('A159_JoineroftheSea')
    setAccumulation(session, 'fishing')
    const response = switchToOwner(session, session.takeAction(1, 'fishing'))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources.wood).toBe(0)
  })

  it('A159 S6: an opponent using a non-Fishing non-Reed-Bank space grants nothing', () => {
    const session = setup('A159_JoineroftheSea', { wood: 1 })
    const response = session.takeAction(1, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })
})
