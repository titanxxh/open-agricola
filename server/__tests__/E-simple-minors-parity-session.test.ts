import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E003_TeaTime'
import '../../shared/cards/E/E008_FarmersMarket'
import '../../shared/cards/E/E029_Heirloom'
import '../../shared/cards/E/E034_LandRegister'

type CardId = 'E003_TeaTime' | 'E008_FarmersMarket' | 'E029_Heirloom' | 'E034_LandRegister'

const setupMinor = (cardId: CardId, resources: { food?: number; wood?: number } = {}, played = false) => {
  const session = new GameSession(3, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = played ? ['__test_placeholder__'] : [cardId]
  player.minorPlayed = played ? [cardId] : []
  player.resources = {
    ...player.resources,
    food: 0,
    wood: 0,
    vegetable: 0,
    ...resources,
  }
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.value.startsWith('action-improvement-')
  })
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId): SessionResponse => {
  let response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId) => {
  const response = enterImprovementChoice(session)
  return response.interaction.stateId === 'wait' &&
    (response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false)
}

const putWorkerOn = (session: GameSession, playerIndex: number, spaceId: string) => {
  const state = session.getState().state
  const player = state.players[playerIndex]!
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
  space.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
  session.loadState(state)
}

describe('E003 Tea Time parity', () => {
  it('E003 S1: Tea Time pays one food, passes, and recalls the owner from Grain Utilization', () => {
    const session = setupMinor('E003_TeaTime', { food: 1 })
    putWorkerOn(session, 0, 'grain-utilization')
    const before = workersAvailable(session.state, session.state.players[0]!)

    const response = playMinor(session, 'E003_TeaTime')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain('E003_TeaTime')
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toEqual([])
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(before)
  })

  it('E003 S2: Tea Time is unavailable without the owner on Grain Utilization', () => {
    expect(cardIsOffered(setupMinor('E003_TeaTime', { food: 1 }), 'E003_TeaTime')).toBe(false)
  })

  it('E003 S3: an opponent on Grain Utilization does not satisfy Tea Time', () => {
    const session = setupMinor('E003_TeaTime', { food: 1 })
    putWorkerOn(session, 1, 'grain-utilization')

    expect(cardIsOffered(session, 'E003_TeaTime')).toBe(false)
  })

  it('E003 S4: the recalled person can be placed again later in the round', () => {
    const session = setupMinor('E003_TeaTime', { food: 1 })
    putWorkerOn(session, 0, 'grain-utilization')
    const played = playMinor(session, 'E003_TeaTime')
    played.state.currentPlayerIndex = 0
    session.loadState(played.state)

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy)
      .toHaveLength(1)
  })
})

describe('E029 Heirloom parity', () => {
  it('E029 S1: Heirloom is playable with the owner on Day Laborer and scores two points', () => {
    const session = setupMinor('E029_Heirloom')
    putWorkerOn(session, 0, 'day-laborer')

    const response = playMinor(session, 'E029_Heirloom')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('E029_Heirloom')
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: 'E029_Heirloom', score: 2 }))
  })

  it('E029 S2: Heirloom is unavailable without the owner on Day Laborer', () => {
    expect(cardIsOffered(setupMinor('E029_Heirloom'), 'E029_Heirloom')).toBe(false)
  })

  it('E029 S3: an opponent on Day Laborer does not satisfy Heirloom', () => {
    const session = setupMinor('E029_Heirloom')
    putWorkerOn(session, 1, 'day-laborer')

    expect(cardIsOffered(session, 'E029_Heirloom')).toBe(false)
  })
})

describe('E008 Farmers Market parity', () => {
  it('E008 S1: Farmers Market pays two food, gains one vegetable, and passes', () => {
    const response = playMinor(setupMinor('E008_FarmersMarket', { food: 2 }), 'E008_FarmersMarket')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
    expect(response.state.players[1]!.minorHand).toContain('E008_FarmersMarket')
  })

  it('E008 S2: Farmers Market is unavailable with less than two food', () => {
    expect(cardIsOffered(setupMinor('E008_FarmersMarket', { food: 1 }), 'E008_FarmersMarket')).toBe(false)
  })
})

const fillFarm = (session: GameSession, unused: number) => {
  const player = session.state.players[0]!
  const occupied = new Set(player.roomTiles.map((tile) => `${tile.row},${tile.col}`))
  player.fields = Array.from({ length: 3 }, (_, row) => {
    return Array.from({ length: 5 }, (_, col) => ({ row, col, stacks: [] }))
  }).flat().filter((tile) => !occupied.has(`${tile.row},${tile.col}`)).slice(0, 13 - unused)
}

const landRegisterBonus = (session: GameSession) => session.getState().scores[0]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries
  .find((entry) => entry.type === 'bonus' && entry.cardId === 'E034_LandRegister')?.score ?? 0

describe('E034 Land Register parity', () => {
  it('E034 S1: Land Register costs one wood and stays in play', () => {
    const response = playMinor(setupMinor('E034_LandRegister', { wood: 1 }), 'E034_LandRegister')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain('E034_LandRegister')
  })

  it('E034 S2: Land Register scores two bonus points with no unused farm spaces', () => {
    const session = setupMinor('E034_LandRegister', {}, true)
    fillFarm(session, 0)

    expect(landRegisterBonus(session)).toBe(2)
  })

  it('E034 S3: Land Register scores no bonus with one unused farm space', () => {
    const session = setupMinor('E034_LandRegister', {}, true)
    fillFarm(session, 1)

    expect(landRegisterBonus(session)).toBe(0)
  })
})
