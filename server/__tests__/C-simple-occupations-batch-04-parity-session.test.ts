import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { isCardFlagged, readCardExtraData } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/C/C111_SmallAnimalBreeder'
import '../../shared/cards/C/C118_WoodCollector'
import '../../shared/cards/C/C139_BasketmakersWife'
import '../../shared/cards/C/C150_ParrotBreeder'
import '../../shared/cards/C/C155_FoodDistributor'
import '../../shared/cards/C/C156_HoofCaregiver'
import '../../shared/cards/C/C162_ForestOwner'
import '../../shared/cards/C/C166_CattleWhisperer'

type CardId =
  | 'C111_SmallAnimalBreeder' | 'C118_WoodCollector' | 'C139_BasketmakersWife'
  | 'C150_ParrotBreeder' | 'C155_FoodDistributor' | 'C156_HoofCaregiver'
  | 'C162_ForestOwner' | 'C166_CattleWhisperer'

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
  const session = new GameSession(4050, undefined, { playerCount })
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
  if (played && cardId === 'C162_ForestOwner') {
    state.actionSpaces.push(...createPlayerActionSpaces(state).filter((space) =>
      !state.actionSpaces.some((existing) => existing.id === space.id),
    ))
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

const setSpaceResource = (state: GameState, spaceId: string, resource: keyof Resource, count: number) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.resources[resource] = count
  space.takenBy = []
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples.filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((a, b) => a - b)

describe('C150 Parrot Breeder parity', () => {
  const setup = () => setupOccupation('C150_ParrotBreeder', {
    playerCount: 4, played: true, resources: { grain: 1 },
  })

  const rightUses = (session: GameSession, spaceId: string) => {
    const state = session.getState().state
    state.currentPlayerIndex = 3
    session.loadState(state)
    session.takeAction(3, spaceId)
    const after = session.getState().state
    after.currentPlayerIndex = 0
    setWorkersAtHome(after, after.players[0]!, 2)
    session.loadState(after)
  }

  it('C150 S1: after the right neighbor uses Forest, paying one grain allows the owner to use occupied Forest', () => {
    const session = setup()
    setSpaceResource(session.state, 'forest', 'wood', 3)
    session.loadState(session.state)
    rightUses(session, 'forest')
    expect(readCardExtraData(session.state.players[0]!, 'C150_ParrotBreeder', 'right')).toBe('forest')
    session.takeAnytimeAction(0, 'C150-parrot-breeder-anytime')
    expect(session.getState().state.players[0]!.resources.grain).toBe(0)
    expect(isCardFlagged(session.getState().state.players[0]!, 'C150_ParrotBreeder')).toBe(true)
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy).toHaveLength(2)
  })

  it('C150 S2: Meeting Place used by the right neighbor cannot be copied', () => {
    const session = setup()
    rightUses(session, 'meeting-place')
    session.takeAnytimeAction(0, 'C150-parrot-breeder-anytime')
    const response = session.takeAction(0, 'meeting-place')
    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
  })
})

describe('C118 Wood Collector parity', () => {
  it('C118 S1: schedules one wood on each of the next five rounds', () => {
    const response = playOccupation(setupOccupation('C118_WoodCollector', { round: 5 }), 'C118_WoodCollector')
    expect(futureRounds(response.state, 'C118_WoodCollector', 'wood')).toEqual([6, 7, 8, 9, 10])
  })

  it('C118 S2: round thirteen schedules only round fourteen wood', () => {
    const response = playOccupation(setupOccupation('C118_WoodCollector', { round: 13 }), 'C118_WoodCollector')
    expect(futureRounds(response.state, 'C118_WoodCollector', 'wood')).toEqual([14])
  })
})

describe('C111 Small Animal Breeder parity', () => {
  const nextRound = (food: number) => {
    const session = setupOccupation('C111_SmallAnimalBreeder', { played: true, round: 5, resources: { food } })
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    state.players.slice(1).forEach((player) => { player.resources.food = 20 })
    session.loadState(state)
    return session.performRoundEnd()
  }

  it('C111 S1: food equal to the upcoming round number grants one food', () => {
    const response = nextRound(6)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(7)
  })

  it('C111 S2: food below the upcoming round number grants no food', () => {
    expect(nextRound(5).state.players[0]!.resources.food).toBe(5)
  })

  it('C111 S3: food above the upcoming round number grants one food', () => {
    expect(nextRound(7).state.players[0]!.resources.food).toBe(8)
  })
})

describe('C155 Food Distributor parity', () => {
  it('C155 S1: playing immediately gains one grain', () => {
    const response = playOccupation(setupOccupation('C155_FoodDistributor', {
      playerCount: 4,
    }), 'C155_FoodDistributor')
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  const returnHome = (purchaseRound: number, round: number, occupied: number) => {
    const session = setupOccupation('C155_FoodDistributor', { playerCount: 4, played: true, round })
    const state = session.getState().state
    state.players.forEach((player) => { player.resources.food = 20 })
    state.players[0]!.cardStates.C155_FoodDistributor = { extraData: { purchaseRound } }
    const ids = ['sheep-market', 'fencing', 'forest', 'clay-pit', 'reed-bank', 'fishing', 'grain-seeds', 'lessons']
    const workers = state.players.flatMap((player) => player.workers.filter((worker) => worker.isActive)
      .map((worker) => ({ player, worker })))
    ids.slice(0, occupied === 0 ? 0 : ids.length).forEach((id, index) => {
      const space = state.actionSpaces.find((candidate) => candidate.id === id)
      const assignment = workers[index]
      if (!space || !assignment) throw new Error('missing end-of-work placement')
      space.takenBy = [{ playerId: assignment.player.id, workerId: assignment.worker.id }]
    })
    session.loadState(state)
    return session.performRoundEnd()
  }

  it('C155 S2: counts only occupied revealed round action spaces', () => {
    expect(returnHome(5, 5, 2).state.players[0]!.resources.food).toBe(22)
  })

  it('C155 S3: does not pay again in a later returning-home phase', () => {
    expect(returnHome(5, 6, 1).state.players[0]!.resources.food).toBe(20)
  })
})

describe('C166 Cattle Whisperer parity', () => {
  it('C166 S1: schedules cattle at offsets five and eight', () => {
    const response = playOccupation(setupOccupation('C166_CattleWhisperer', {
      playerCount: 4, round: 5,
    }), 'C166_CattleWhisperer')
    expect(futureRounds(response.state, 'C166_CattleWhisperer', 'cattle')).toEqual([10, 13])
  })

  it('C166 S2: round ten schedules no cattle beyond round fourteen', () => {
    const response = playOccupation(setupOccupation('C166_CattleWhisperer', {
      playerCount: 4, round: 10,
    }), 'C166_CattleWhisperer')
    expect(futureRounds(response.state, 'C166_CattleWhisperer', 'cattle')).toEqual([])
  })
})

describe('C162 Forest Owner parity', () => {
  it('C162 S1: is an action space for all and gives its owner four wood', () => {
    const response = setupOccupation('C162_ForestOwner', { playerCount: 4, played: true }).takeAction(0, 'C162_ForestOwner')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(4)
  })

  it('C162 S2: another player gains three wood and the owner gains one wood', () => {
    const session = setupOccupation('C162_ForestOwner', { playerCount: 4, played: true })
    session.state.currentPlayerIndex = 1
    session.loadState(session.state)
    const response = session.takeAction(1, 'C162_ForestOwner')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })
})

describe('C139 Basketmakers Wife parity', () => {
  it('C139 S1: playing gains one reed and one food', () => {
    const response = playOccupation(setupOccupation('C139_BasketmakersWife', {
      playerCount: 3,
    }), 'C139_BasketmakersWife')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, food: 1 })
  })

  it('C139 S2: exchanges one reed for two food at any time', () => {
    const session = setupOccupation('C139_BasketmakersWife', {
      playerCount: 3, played: true, resources: { reed: 1 },
    })
    session.takeAction(0, 'farmland')
    session.takeAnytimeAction(0, 'exchange')
    const response = session.resolveChoice(0, 'bulk:0=1')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, food: 2 })
  })
})

describe('C156 Hoof Caregiver parity', () => {
  const playWithCattleMarket = (revealed: boolean) => {
    const session = setupOccupation('C156_HoofCaregiver', { playerCount: 4, round: 14 })
    const cattleMarketRound = session.state.roundActionOrder.indexOf('cattle-market') + 1
    if (cattleMarketRound <= 0) throw new Error('cattle-market round slot missing')
    session.state.round = revealed ? cattleMarketRound : cattleMarketRound - 1
    setSpaceResource(session.state, 'cattle-market', 'cattle', 2)
    session.loadState(session.state)
    return playOccupation(session, 'C156_HoofCaregiver')
  }

  it('C156 S1: revealed Cattle Market gains rewards equal to cattle after adding one', () => {
    const response = playWithCattleMarket(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'cattle-market')?.resources.cattle).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 3, food: 3 })
  })

  it('C156 S2: does not trigger while Cattle Market is unrevealed', () => {
    const response = playWithCattleMarket(false)
    expect(response.state.actionSpaces.find((space) => space.id === 'cattle-market')?.resources.cattle).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 0 })
  })
})
