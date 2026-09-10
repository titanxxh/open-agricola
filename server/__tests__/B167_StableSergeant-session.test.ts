import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/B/B167_StableSergeant'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'B167_StableSergeant'

describe('B167_StableSergeant session', () => {
  it('onBuy returns undefined when all three animals cannot be accommodated', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 2

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBuy offers the pay-for-animals flow when all three animals can be accommodated', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 2
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    player.stableTiles = [{ row: 2, col: 2 }]
    player.stableAnimals = {}

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player) as ActionFlow
    expect(flow).toBeDefined()
    expect(flow.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.optional).toBe(true)
    expect(seq.children[0]).toMatchObject({
      type: 'leaf',
      actionId: 'pay',
      params: { food: 2 },
      sourceCard: CARD_ID,
    })
    expect(seq.children[1]).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { sheep: 1, boar: 1, cattle: 1 },
      sourceCard: CARD_ID,
    })
  })
})

describe('B167 Stable Sergeant parity', () => {
  const CARD_ID = 'B167_StableSergeant'

  const FILLER = '__test_placeholder__'

  const setup = ({ food = 2, capacity = true } = {}) => {
    const session = new GameSession(6167, undefined, { playerCount: 4 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.houseAnimalType = null
      player.houseAnimalCount = 0
      player.stableTiles = []
      player.stableAnimals = {}
      player.pastures = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = [CARD_ID]
    owner.resources.food = food
    if (capacity) {
      owner.pastures = [{
        id: 'stable-sergeant-pasture', size: 1, tiles: [{ row: 0, col: 1 }], stables: 0,
        animalType: null, animalCount: 0,
      }]
      owner.stableTiles = [{ row: 1, col: 1 }]
    }
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playOccupation = (session: GameSession) => {
    const response = session.takeAction(0, 'lessons')
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, card!.value)
  }

  const accept = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = options(response).find((candidate) =>
      candidate.value !== '__skip__' && candidate.value !== 'skip')
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, option!.value)
  }

  const placeAnimals = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'animal-reorg' },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'animal-reorg') return response
    const pasture = response.interaction.request.zones.find((zone) =>
      zone.id === 'stable-sergeant-pasture')
    const stable = response.interaction.request.zones.find((zone) => zone.zoneType === 'stable')
    const house = response.interaction.request.zones.find((zone) => zone.zoneType === 'house')
    expect(pasture).toBeDefined()
    expect(stable).toBeDefined()
    expect(house).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, 'confirm', {
      zones: [
        { ...pasture!, animalType: 'sheep', animalCount: 1 },
        { ...stable!, animalType: 'boar', animalCount: 1 },
        { ...house!, animalType: 'cattle', animalCount: 1 },
      ],
    })
  }

  it('B167 S1: accepting Stable Sergeant pays two food and gains all three animals', () => {
    const session = setup()
    const response = placeAnimals(session, accept(session, playOccupation(session)))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(4)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, sheep: 1, boar: 1, cattle: 1,
    })
  })

  it('B167 S2: declining Stable Sergeant keeps the food and gains no animal', () => {
    const session = setup()
    let response = playOccupation(session)
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 0, boar: 0, cattle: 0,
    })
  })

  it('B167 S3: lacking two food plays Stable Sergeant with only the decline path', () => {
    const response = playOccupation(setup({ food: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(options(response).filter((option) => option.value !== '__skip__')).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 1, sheep: 0, boar: 0, cattle: 0,
    })
  })

  it('B167 S4: insufficient animal capacity plays Stable Sergeant without offering its purchase', () => {
    const response = playOccupation(setup({ capacity: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 0, boar: 0, cattle: 0,
    })
  })
})
