import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/A/A125_Priest'
import '../../shared/cards/A/A141_TurnipFarmer'
import '../../shared/cards/A/A157_Bohemian'
import '../../shared/cards/A/A162_ForestTallyman'
import '../../shared/cards/A/A165_PigBreeder'

type CardId =
  | 'A125_Priest'
  | 'A141_TurnipFarmer'
  | 'A157_Bohemian'
  | 'A162_ForestTallyman'
  | 'A165_PigBreeder'

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: CardId, {
  playerCount = 2,
  played = false,
  round = 14,
  resources = {},
}: {
  playerCount?: number
  played?: boolean
  round?: number
  resources?: Partial<Resource>
} = {}) => {
  const session = new GameSession(4042, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [cardId]
  player.occupationPlayed = played ? [cardId] : []
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0,
    ...resources,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: CardId) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const occupy = (state: GameState, actionId: string, playerIndex: number) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === actionId)
  if (!space) throw new Error(`${actionId} missing`)
  const player = state.players[playerIndex]!
  space.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
}

const setupReturnHome = (cardId: CardId, playerCount: number, occupied: string[]) => {
  const session = setupOccupation(cardId, { playerCount, played: true, round: 3 })
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
    player.resources.food = 20
  })
  occupied.forEach((actionId, index) => occupy(state, actionId, Math.min(index + 1, playerCount - 1)))
  session.loadState(state)
  return session
}

describe('A125 Priest parity', () => {
  it('A125 S1: playing Priest in a two-room clay house gains three clay, two reed, and two stone', () => {
    const session = setupOccupation('A125_Priest')
    session.state.players[0]!.houseType = 'clay'
    session.loadState(session.state)

    const response = playOccupation(session, 'A125_Priest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A125_Priest')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, reed: 2, stone: 2 })
  })

  it('A125 S2: playing Priest in a wooden house gains no building resources', () => {
    const response = playOccupation(setupOccupation('A125_Priest'), 'A125_Priest')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, stone: 0 })
  })

  it('A125 S3: playing Priest in a three-room clay house gains no building resources', () => {
    const session = setupOccupation('A125_Priest')
    const player = session.state.players[0]!
    player.houseType = 'clay'
    player.rooms = 3
    player.roomTiles.push({ row: 0, col: 2 })
    session.loadState(session.state)

    const response = playOccupation(session, 'A125_Priest')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, stone: 0 })
  })
})

describe('A141 Turnip Farmer parity', () => {
  it('A141 S1: occupied Day Laborer and Grain Seeds grant one vegetable at return home', () => {
    const response = setupReturnHome(
      'A141_TurnipFarmer', 3, ['day-laborer', 'grain-seeds'],
    ).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('A141 S2: an unoccupied Grain Seeds space prevents the return-home vegetable', () => {
    const response = setupReturnHome('A141_TurnipFarmer', 3, ['day-laborer']).performRoundEnd()

    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })
})

describe('A157 Bohemian parity', () => {
  it('A157 S1: an unoccupied Lessons space grants one food at return home', () => {
    const response = setupReturnHome('A157_Bohemian', 4, ['lessons']).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(21)
  })

  it('A157 S2: both Lessons spaces occupied grant no food at return home', () => {
    const response = setupReturnHome('A157_Bohemian', 4, ['lessons', 'lessons-4']).performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(20)
  })
})

const setupForestTallyman = ({ occupied = true, actor = 0 } = {}) => {
  const session = setupOccupation('A162_ForestTallyman', { playerCount: 4, played: true })
  const state = session.getState().state
  state.actionSpaces.push(...createPlayerActionSpaces(state).filter((space) =>
    !state.actionSpaces.some((existing) => existing.id === space.id),
  ))
  if (occupied) {
    occupy(state, 'forest', 1)
    occupy(state, 'clay-pit', 2)
  }
  state.currentPlayerIndex = actor
  session.loadState(state)
  return session
}

describe('A162 Forest Tallyman parity', () => {
  it('A162 S1: playing Forest Tallyman through Lessons keeps it in play', () => {
    const response = playOccupation(setupOccupation('A162_ForestTallyman', { playerCount: 4 }), 'A162_ForestTallyman')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A162_ForestTallyman')
    expect(response.state.actionSpaces.some((space) => space.id === 'A162_ForestTallyman')).toBe(true)
  })

  it('A162 S2: with Forest and Clay Pit occupied the owner gains two clay and three wood', () => {
    const response = setupForestTallyman().takeAction(0, 'A162_ForestTallyman')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, wood: 3 })
  })

  it('A162 S3: rejects Forest Tallyman while Clay Pit is unoccupied', () => {
    const session = setupForestTallyman({ occupied: false })
    expect(session.getState().actionAvailability?.A162_ForestTallyman).toBe(false)

    const response = session.takeAction(0, 'A162_ForestTallyman')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'A162_ForestTallyman')?.takenBy)
      .toHaveLength(0)
  })

  it('A162 S4: rejects a non-owner on the private Forest Tallyman space', () => {
    const session = setupForestTallyman({ actor: 3 })
    expect(session.getState().actionAvailability?.A162_ForestTallyman).toBe(false)

    const response = session.takeAction(3, 'A162_ForestTallyman')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[3]!.resources).toMatchObject({ clay: 0, wood: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'A162_ForestTallyman')?.takenBy)
      .toEqual([])
  })
})

const setupPigBreederRound = ({ round = 12, boar = 2, capacity = true } = {}) => {
  const session = setupOccupation('A165_PigBreeder', { playerCount: 4, played: true, round })
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.resources.boar = boar
  player.resources.sheep = capacity ? 0 : 1
  player.houseAnimalType = capacity ? null : 'sheep'
  player.houseAnimalCount = capacity ? 0 : 1
  player.stableAnimals = {}
  player.pastures = capacity
    ? [{
        id: 'boar-pasture',
        size: 2,
        tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
        stables: 0,
        animalType: 'boar',
        animalCount: boar,
      }]
    : [{
        id: 'boar-pasture',
        size: 1,
        tiles: [{ row: 0, col: 1 }],
        stables: 0,
        animalType: 'boar',
        animalCount: boar,
      }]
  session.loadState(state)
  return session
}

describe('A165 Pig Breeder parity', () => {
  it('A165 S1: playing Pig Breeder immediately gains one pig', () => {
    const response = playOccupation(setupOccupation('A165_PigBreeder', {
      playerCount: 4,
    }), 'A165_PigBreeder')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A165_PigBreeder')
    expect(response.state.players[0]!.resources.boar).toBe(1)
  })

  it('A165 S2: two pigs with spare capacity breed once at the end of round 12', () => {
    const response = setupPigBreederRound().performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(3)
  })

  it('A165 S3: Pig Breeder does not cause extra breeding outside round 12', () => {
    const response = setupPigBreederRound({ round: 10 }).performRoundEnd()

    expect(response.state.players[0]!.resources.boar).toBe(2)
  })

  it('A165 S4: a single pig does not breed at the end of round 12', () => {
    const response = setupPigBreederRound({ boar: 1 }).performRoundEnd()

    expect(response.state.players[0]!.resources.boar).toBe(1)
  })

  it('A165 S5: a newborn pig is discarded when no animal capacity is free', () => {
    const session = setupPigBreederRound({ capacity: false })
    let response = session.performRoundEnd()
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(0, 'confirm', {
        zones: [
          { id: 'boar-pasture', zoneType: 'pasture', animalType: 'boar', animalCount: 2 },
          { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
        ],
      })
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })
})
