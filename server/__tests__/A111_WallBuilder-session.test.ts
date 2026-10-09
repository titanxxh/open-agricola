import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A111_WallBuilder'

const CARD_ID = 'A111_WallBuilder'

describe('A111_WallBuilder session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    // Enough for a wood room (5 wood + 2 reed).
    player.resources = { ...player.resources, wood: 10, reed: 3, clay: 0, stone: 0 }
    player.houseType = 'wood'

    session.loadState(state)
    return session
  }

  it('queues 1 FOOD on each of next 4 round spaces after building a room', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    // farm-expansion OR between construct & stables with both resources present.
    if (resp.interaction.stateId === 'wait') {
      const constructOption = resp.interaction.request.options?.find(
        (o) => o.labelKey === 'actions.construct.name',
      )
      expect(constructOption).toBeDefined()
      resp = session.resolveChoice(0, constructOption!.value)
    }
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('room')
    if (resp.interaction.request.farm.farmType !== 'room') return

    const room = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [room] })
    expect(resp.ok).toBe(true)

    const playerId = resp.state.players[0]!.id
    const entries = resp.state.futureMeeples.filter(
      (e) => e.cardId === CARD_ID && e.playerId === playerId,
    )
    expect(entries).toHaveLength(4)
    const rounds = entries.map((e) => e.round).sort((a, b) => a - b)
    expect(rounds).toEqual([4, 5, 6, 7])
    entries.forEach((entry) => {
      expect(entry.resources.food).toBe(1)
    })
  })

  it('does not trigger when card is not played', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.resources = { ...player.resources, wood: 10, reed: 3 }

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const constructOption = resp.interaction.request.options?.find(
        (o) => o.labelKey === 'actions.construct.name',
      )
      resp = session.resolveChoice(0, constructOption!.value)
    }
    if (resp.interaction.stateId !== 'wait') return
    if (resp.interaction.request.farm.farmType !== 'room') return

    const room = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [room] })
    expect(resp.ok).toBe(true)
    const entries = resp.state.futureMeeples.filter((e) => e.cardId === CARD_ID)
    expect(entries).toHaveLength(0)
  })
})

describe('A111 Wall Builder parity', () => {
  const CARD_ID = 'A111_WallBuilder'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, round = 5, wood = 10, reed = 4, food = 0,
  }: { played?: boolean; round?: number; wood?: number; reed?: number; food?: number } = {}) => {
    const session = new GameSession(6111 + round, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.wood = wood
    owner.resources.reed = reed
    owner.resources.food = food
    owner.houseType = 'wood'
    session.loadState(state)
    return session
  }

  const chooseConstruct = (session: GameSession, response: SessionResponse) => {
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => {
      return candidate.labelKey === 'actions.construct.name'
    })
    return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
  }

  const buildRooms = (session: GameSession, count: number) => {
    const response = chooseConstruct(session, session.takeAction(0, 'farm-expansion'))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { farm: { farmType: 'room' } },
    })
    if (response.interaction.stateId !== 'wait') return response
    const rooms = response.interaction.request.farm.selectableTiles.slice(0, count)
    expect(rooms).toHaveLength(count)
    return session.commitSelectionChoice(response.interaction.playerIndex, { rooms })
  }

  const buildStable = (session: GameSession) => {
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => {
      return candidate.labelKey === 'actions.buildStables.name'
    })
    if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
    if (response.interaction.stateId !== 'wait') return response
    const stable = response.interaction.request.farm.selectableTiles[0]
    return session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable!] })
  }

  const futureFoodRounds = (response: SessionResponse) => response.state.futureMeeples
    .filter((entry) => entry.cardId === CARD_ID && entry.resources.food === 1)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

  it('A111 S3: building two rooms in one action still schedules only four food', () => {
    const response = buildRooms(setup(), 2)

    expect(response.ok, response.error).toBe(true)
    expect(futureFoodRounds(response)).toEqual([6, 7, 8, 9])
  })

  it('A111 S4: building only a stable schedules no Wall Builder food', () => {
    const response = buildStable(setup({ wood: 2, reed: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(futureFoodRounds(response)).toEqual([])
  })

  it('A111 S5: the first scheduled food is received at the start of the next round', () => {
    const session = setup({ food: 20 })
    const built = buildRooms(session, 1)
    expect(futureFoodRounds(built)).toEqual([6, 7, 8, 9])
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureFoodRounds(response)).toEqual([7, 8, 9])
  })

  it('A111 S6: building in round twelve schedules food only for rounds thirteen and fourteen', () => {
    const response = buildRooms(setup({ round: 12 }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(futureFoodRounds(response)).toEqual([13, 14])
  })
})
