import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E104_SpiceTrader'
import '../../shared/cards/E/E119_LandHeir'
import '../../shared/cards/E/E120_ScrapCollector'
import '../../shared/cards/E/E168_AnimalTamersApprentice'

type CardId =
  | 'E104_SpiceTrader' | 'E119_LandHeir' | 'E120_ScrapCollector'
  | 'E168_AnimalTamersApprentice'

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: CardId, {
  playerCount = 2, played = false, round = 5, resources = {},
}: {
  playerCount?: number
  played?: boolean
  round?: number
  resources?: Partial<Resource>
} = {}) => {
  const session = new GameSession(4058, undefined, { playerCount })
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
    sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: CardId) => {
  const response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(0, option.value) : response
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples.filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

const startNextRound = (houseType: 'wood' | 'clay' | 'stone', extraRoom: boolean) => {
  const session = setupOccupation('E168_AnimalTamersApprentice', {
    playerCount: 4, played: true, round: 5, resources: { food: 20 },
  })
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.houseType = houseType
  setActiveWorkerCount(player, 2)
  player.rooms = extraRoom ? 3 : 2
  player.roomTiles = Array.from({ length: player.rooms }, (_, row) => ({ row, col: 0 }))
  session.loadState(state)
  return session.performRoundEnd()
}

describe('E168 Animal Tamers Apprentice parity', () => {
  for (const [houseType, animal] of [['wood', 'sheep'], ['clay', 'boar'], ['stone', 'cattle']] as const) {
    it(`E168 ${houseType}: one unoccupied room grants one ${animal} at round start`, () => {
      const response = startNextRound(houseType, true)
      expect(response.state.round).toBe(6)
      expect(response.state.players[0]!.resources[animal]).toBe(1)
    })
  }

  it('E168 S4: no unoccupied room grants no animal', () => {
    const response = startNextRound('wood', false)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 0 })
    expect(familySize(response.state.players[0]!)).toBe(2)
  })

  it('E168 S5: OA treats a house pet as freeing an occupied room and grants a sheep', () => {
    const session = setupOccupation('E168_AnimalTamersApprentice', {
      playerCount: 4, played: true, round: 5, resources: { food: 20 },
    })
    const state = session.getState().state
    state.players.forEach((player) => { markAllWorkersUsed(state, player); player.resources.food = 20 })
    const player = state.players[0]!
    setActiveWorkerCount(player, 2)
    player.rooms = 2
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    session.loadState(state)
    const response = session.performRoundEnd()
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })
})

describe('E119 Land Heir parity', () => {
  it('E119 S1: playing by round four schedules four wood and four clay on round nine', () => {
    const response = playOccupation(setupOccupation('E119_LandHeir', { round: 4 }), 'E119_LandHeir')
    expect(futureRounds(response.state, 'E119_LandHeir', 'wood')).toEqual([9, 9, 9, 9])
    expect(futureRounds(response.state, 'E119_LandHeir', 'clay')).toEqual([9, 9, 9, 9])
  })

  it('E119 S2: playing after round four schedules nothing', () => {
    const response = playOccupation(setupOccupation('E119_LandHeir', { round: 5 }), 'E119_LandHeir')
    expect(futureRounds(response.state, 'E119_LandHeir', 'wood')).toEqual([])
    expect(futureRounds(response.state, 'E119_LandHeir', 'clay')).toEqual([])
  })
})

describe('E120 Scrap Collector parity', () => {
  it('E120 S1: alternates wood and clay across the next six rounds', () => {
    const response = playOccupation(setupOccupation('E120_ScrapCollector', { round: 5 }), 'E120_ScrapCollector')
    expect(futureRounds(response.state, 'E120_ScrapCollector', 'wood')).toEqual([6, 8, 10])
    expect(futureRounds(response.state, 'E120_ScrapCollector', 'clay')).toEqual([7, 9, 11])
  })

  it('E120 S2: round twelve keeps wood on thirteen and clay on fourteen', () => {
    const response = playOccupation(setupOccupation('E120_ScrapCollector', { round: 12 }), 'E120_ScrapCollector')
    expect(futureRounds(response.state, 'E120_ScrapCollector', 'wood')).toEqual([13])
    expect(futureRounds(response.state, 'E120_ScrapCollector', 'clay')).toEqual([14])
  })
})

describe('E104 Spice Trader parity', () => {
  it('E104 S1: playing by round four schedules three vegetables on round eleven', () => {
    const response = playOccupation(setupOccupation('E104_SpiceTrader', { round: 4 }), 'E104_SpiceTrader')
    expect(futureRounds(response.state, 'E104_SpiceTrader', 'vegetable')).toEqual([11, 11, 11])
  })

  it('E104 S2: playing after round four schedules nothing', () => {
    const response = playOccupation(setupOccupation('E104_SpiceTrader', { round: 5 }), 'E104_SpiceTrader')
    expect(futureRounds(response.state, 'E104_SpiceTrader', 'vegetable')).toEqual([])
  })
})
