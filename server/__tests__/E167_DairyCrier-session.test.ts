import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { setFencesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A085_Homekeeper'
import '../../shared/cards/E/E167_DairyCrier'

const CARD_ID = 'E167_DairyCrier'
const FILLER = 'A085_Homekeeper'
type Reward = 'food' | 'sheep' | 'pass'

const setup = () => {
  const session = new GameSession(7167, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = index === 0 ? [CARD_ID, FILLER] : ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, 2)
    player.pastures = [{
      id: `dairy-pasture-${index}`,
      size: 1,
      tiles: [{ row: 0, col: 2 }],
      stableCount: 0,
      animalType: null,
      animalCount: 0,
    }]
    setFencesForTest(player, 4)
  })
  session.loadState(state)
  return session
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playDairyCrier = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = optionsOf(response).find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  expect(response.ok, response.error).toBe(true)
  return response
}

const arrangeAnimals = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'animal-reorg') return response
  const playerIndex = response.interaction.playerIndex
  const player = response.state.players[playerIndex]!
  const zones = response.interaction.request.zones.map((zone) => {
    if (zone.zoneType === 'house' && player.resources.cattle > 0) {
      return { ...zone, animalType: 'cattle' as const, animalCount: 1 }
    }
    if (zone.zoneType === 'pasture' && player.resources.sheep > 0) {
      return { ...zone, animalType: 'sheep' as const, animalCount: Math.min(2, zone.capacity) }
    }
    return { ...zone, animalType: null, animalCount: 0 }
  })
  return session.resolveChoice(playerIndex, 'confirm', { zones })
}

const resolveDairyCrier = (
  session: GameSession,
  initial: SessionResponse,
  rewards: readonly Reward[],
) => {
  let response = initial
  let safety = 40
  while (safety-- > 0 && response.interaction.stateId === 'wait') {
    const request = response.interaction.request
    if (request.kind === 'animal-reorg') {
      response = arrangeAnimals(session, response)
      continue
    }
    if (request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
      continue
    }
    if (request.kind === 'confirm-next-player') break
    const playerIndex = response.interaction.playerIndex
    const reward = rewards[playerIndex]
    const option = reward === 'pass'
      ? optionsOf(response).find((candidate) => candidate.value === '__skip__')
      : optionsOf(response).find((candidate) =>
        candidate.effectPreview?.resourcesGained?.[reward] === 2,
      )
    if (!option) break
    response = session.resolveChoice(playerIndex, option.value)
    expect(response.ok, response.error).toBe(true)
  }
  expect(safety).toBeGreaterThan(0)
  return response
}

describe('E167 Dairy Crier parity', () => {
  it('E167 S1: Dairy Crier can be played as the first occupation in a four-player game', () => {
    const session = setup()

    const response = resolveDairyCrier(
      session, playDairyCrier(session), ['pass', 'pass', 'pass', 'pass'],
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('E167 S2: every player can choose two food and the owner also gains one cattle', () => {
    const session = setup()

    const response = resolveDairyCrier(
      session, playDairyCrier(session), ['food', 'food', 'food', 'food'],
    )

    expect(response.state.players.map((player) => player.resources.food)).toEqual([2, 2, 2, 2])
    expect(response.state.players.map((player) => player.resources.cattle)).toEqual([1, 0, 0, 0])
  })

  it('E167 S3: every player can choose two sheep and keep them in a pasture', () => {
    const session = setup()

    const response = resolveDairyCrier(
      session, playDairyCrier(session), ['sheep', 'sheep', 'sheep', 'sheep'],
    )

    expect(response.state.players.map((player) => player.resources.sheep)).toEqual([2, 2, 2, 2])
    expect(response.state.players[0]!.resources.cattle).toBe(1)
  })

  it('E167 S4: the four players choose their rewards independently', () => {
    const session = setup()

    const response = resolveDairyCrier(
      session, playDairyCrier(session), ['food', 'sheep', 'pass', 'food'],
    )

    expect(response.state.players.map((player) => ({
      food: player.resources.food,
      sheep: player.resources.sheep,
    }))).toEqual([
      { food: 2, sheep: 0 },
      { food: 0, sheep: 2 },
      { food: 0, sheep: 0 },
      { food: 2, sheep: 0 },
    ])
  })

  it('E167 S5: every player may decline while the owner still gains one cattle', () => {
    const session = setup()

    const response = resolveDairyCrier(
      session, playDairyCrier(session), ['pass', 'pass', 'pass', 'pass'],
    )

    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 0, 0, 0])
    expect(response.state.players.map((player) => player.resources.sheep)).toEqual([0, 0, 0, 0])
    expect(response.state.players[0]!.resources.cattle).toBe(1)
  })

  it('E167 S6: the owner receives the cattle before the four reward choices', () => {
    const session = setup()

    const response = playDairyCrier(session)

    expect(response.state.players[0]!.resources.cattle).toBe(1)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.kind).toBe('animal-reorg')
  })
})
