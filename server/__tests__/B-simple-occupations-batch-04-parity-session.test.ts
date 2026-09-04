import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { setFencesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B105_CaseBuilder'
import '../../shared/cards/B/B106_MoralCrusader'
import '../../shared/cards/B/B110_Pavior'
import '../../shared/cards/B/B114_Childless'
import '../../shared/cards/B/B117_Informant'
import '../../shared/cards/B/B119_Lumberjack'
import '../../shared/cards/B/B160_PubOwner'
import '../../shared/cards/B/B164_SheepWhisperer'

type CardId =
  | 'B105_CaseBuilder'
  | 'B106_MoralCrusader'
  | 'B110_Pavior'
  | 'B114_Childless'
  | 'B117_Informant'
  | 'B119_Lumberjack'
  | 'B160_PubOwner'
  | 'B164_SheepWhisperer'

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: CardId, {
  playerCount = 2,
  played = false,
  round = 5,
  resources = {},
}: {
  playerCount?: number
  played?: boolean
  round?: number
  resources?: Partial<Resource>
} = {}) => {
  const session = new GameSession(4046, undefined, { playerCount })
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

const setupRoundEnd = (cardId: CardId, {
  playerCount = 2,
  round = 5,
  resources = {},
  occupied = [],
  setup,
}: {
  playerCount?: number
  round?: number
  resources?: Partial<Resource>
  occupied?: [number, string][]
  setup?: (state: GameState) => void
} = {}) => {
  const session = setupOccupation(cardId, { playerCount, played: true, round, resources })
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
    player.resources.food = 20
  })
  occupied.forEach(([playerIndex, actionId]) => occupy(state, actionId, playerIndex))
  setup?.(state)
  session.loadState(state)
  return session
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

describe('B105 Case Builder parity', () => {
  it('B105 S1: gains one of every listed good already held in quantity two', () => {
    const response = playOccupation(setupOccupation('B105_CaseBuilder', {
      resources: { food: 2, grain: 2, vegetable: 2, reed: 2, wood: 2 },
    }), 'B105_CaseBuilder')
    expect(response.state.players[0]!.occupationPlayed).toContain('B105_CaseBuilder')
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 3, grain: 3, vegetable: 3, reed: 3, wood: 3,
    })
  })

  it('B105 S2: gains only goods meeting the threshold', () => {
    const response = playOccupation(setupOccupation('B105_CaseBuilder', {
      resources: { food: 2, grain: 1, vegetable: 0, reed: 2, wood: 1 },
    }), 'B105_CaseBuilder')
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 3, grain: 1, vegetable: 0, reed: 3, wood: 1,
    })
  })
})

describe('B106 Moral Crusader parity', () => {
  it('B106 S1: a promised good on a later round grants one food before the next round starts', () => {
    const session = setupRoundEnd('B106_MoralCrusader', {
      round: 5,
      setup: (state) => state.futureMeeples.push({
        id: 'future-good', cardId: 'test-future-good', playerId: state.players[0]!.id,
        round: 7, actionId: null, resources: { wood: 1 },
      }),
    })
    const response = session.performRoundEnd()
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
  })

  it('B106 S2: no promised future good grants no food', () => {
    const response = setupRoundEnd('B106_MoralCrusader', { round: 5 }).performRoundEnd()
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(20)
  })
})

describe('B110 Pavior parity', () => {
  it('B110 S1: owning stone grants one food at the end of preparation', () => {
    const response = setupRoundEnd('B110_Pavior', { round: 5, resources: { stone: 1 } }).performRoundEnd()
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 21, vegetable: 0 })
  })

  it('B110 S2: owning no stone grants no preparation reward', () => {
    const response = setupRoundEnd('B110_Pavior', { round: 5 }).performRoundEnd()
    expect(response.state.players[0]!.resources.food).toBe(20)
  })

  it('B110 S3: entering round fourteen with stone grants one vegetable instead of food', () => {
    const response = setupRoundEnd('B110_Pavior', { round: 13, resources: { stone: 1 } }).performRoundEnd()
    expect(response.state.round).toBe(14)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 16, vegetable: 1 })
  })
})

describe('B114 Childless parity', () => {
  const childlessRound = ({ rooms = 3, family = 2 } = {}) => setupRoundEnd('B114_Childless', {
    round: 5,
    setup: (state) => {
      const player = state.players[0]!
      player.rooms = rooms
      player.roomTiles = Array.from({ length: rooms }, (_, index) => ({ row: index, col: 0 }))
      setActiveWorkerCount(player, family)
      markAllWorkersUsed(state, player)
    },
  })

  for (const [scenario, crop] of [['S1', 'grain'], ['S2', 'vegetable']] as const) {
    it(`B114 ${scenario}: three rooms and two people grant one food and one ${crop}`, () => {
      const session = childlessRound()
      let response = session.performRoundEnd()
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return
      const option = response.interaction.request.options?.find((candidate) => JSON.stringify(candidate).includes(crop))
      expect(option).toBeDefined()
      response = session.resolveChoice(0, option!.value)
      expect(response.state.players[0]!.resources.food).toBe(21)
      expect(response.state.players[0]!.resources[crop]).toBe(1)
    })
  }

  it('B114 S3: fewer than three rooms grants no crop or food', () => {
    const response = childlessRound({ rooms: 2 }).performRoundEnd()
    expect(response.state.players[0]!.resources).toMatchObject({ food: 20, grain: 0, vegetable: 0 })
  })

  it('B114 S4: three people grant no crop or food', () => {
    const response = childlessRound({ family: 3 }).performRoundEnd()
    expect(response.state.players[0]!.resources).toMatchObject({ food: 20, grain: 0, vegetable: 0 })
  })
})

describe('B117 Informant parity', () => {
  it('B117 S1: playing Informant immediately gains one wood', () => {
    const response = playOccupation(setupOccupation('B117_Informant'), 'B117_Informant')
    expect(response.state.players[0]!.occupationPlayed).toContain('B117_Informant')
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('B117 S2: more stone than clay grants one wood after the work phase', () => {
    const response = setupRoundEnd('B117_Informant', { resources: { stone: 2, clay: 1 } }).performRoundEnd()
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('B117 S3: equal stone and clay grants no wood after the work phase', () => {
    const response = setupRoundEnd('B117_Informant', { resources: { stone: 1, clay: 1 } }).performRoundEnd()
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})

describe('B119 Lumberjack parity', () => {
  const playWithFences = (round: number, fences: number) => {
    const session = setupOccupation('B119_Lumberjack', { round })
    setFencesForTest(session.state.players[0]!, fences)
    session.loadState(session.state)
    return playOccupation(session, 'B119_Lumberjack')
  }

  it('B119 S1: gains one wood and schedules one wood per built fence', () => {
    const response = playWithFences(5, 3)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(futureRounds(response.state, 'B119_Lumberjack', 'wood')).toEqual([6, 7, 8])
  })

  it('B119 S2: without fences only gains the immediate wood', () => {
    const response = playWithFences(5, 0)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(futureRounds(response.state, 'B119_Lumberjack', 'wood')).toEqual([])
  })

  it('B119 S3: three fences in round thirteen schedule only one wood for round fourteen', () => {
    const response = playWithFences(13, 3)
    expect(futureRounds(response.state, 'B119_Lumberjack', 'wood')).toEqual([14])
  })
})

describe('B160 Pub Owner parity', () => {
  it('B160 S1: playing Pub Owner in a four-player game immediately gains one grain', () => {
    const response = playOccupation(setupOccupation('B160_PubOwner', { playerCount: 4 }), 'B160_PubOwner')
    expect(response.state.players[0]!.occupationPlayed).toContain('B160_PubOwner')
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('B160 S2: all three named accumulation spaces occupied grant one grain after work', () => {
    const response = setupRoundEnd('B160_PubOwner', {
      playerCount: 4,
      occupied: [[1, 'forest'], [2, 'clay-pit'], [3, 'reed-bank']],
    }).performRoundEnd()
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('B160 S3: one named accumulation space unoccupied grants no grain after work', () => {
    const response = setupRoundEnd('B160_PubOwner', {
      playerCount: 4,
      occupied: [[1, 'forest'], [2, 'clay-pit']],
    }).performRoundEnd()
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('B164 Sheep Whisperer parity', () => {
  it('B164 S1: round three schedules sheep for rounds five, eight, eleven, and thirteen', () => {
    const response = playOccupation(setupOccupation('B164_SheepWhisperer', {
      playerCount: 4, round: 3,
    }), 'B164_SheepWhisperer')
    expect(futureRounds(response.state, 'B164_SheepWhisperer', 'sheep')).toEqual([5, 8, 11, 13])
  })

  it('B164 S2: round ten keeps only the round-twelve sheep', () => {
    const response = playOccupation(setupOccupation('B164_SheepWhisperer', {
      playerCount: 4, round: 10,
    }), 'B164_SheepWhisperer')
    expect(futureRounds(response.state, 'B164_SheepWhisperer', 'sheep')).toEqual([12])
  })
})
