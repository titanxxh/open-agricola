import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { AnimalType } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D165_PigStalker'

const CARD_ID = 'D165_PigStalker'
const FILLER = '__test_placeholder__'

const MARKET_IDS = {
  sheep: 'sheep-market',
  boar: 'pig-market',
  cattle: 'cattle-market',
} as const

type MarketAnimal = keyof typeof MARKET_IDS
type ZoneAssignment = {
  id: string
  zoneType: 'pasture' | 'house' | 'card'
  animalType: AnimalType | null
  animalCount: number
  cardId?: string
}

const moveRoundActionTo = (order: (string | null)[], actionId: string, round: number) => {
  const currentIndex = order.indexOf(actionId)
  const targetIndex = round - 1
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= order.length) {
    throw new Error(`cannot move ${actionId} to round ${round}`)
  }
  const displaced = order[targetIndex] ?? null
  order[targetIndex] = actionId
  order[currentIndex] = displaced
}

const setup = ({
  played = true, marketAnimal = 'sheep' as MarketAnimal, marketRound = 1,
  occupiedRound = null as number | null, occupiedPlayerIndex = 0, marketCount = 1,
} = {}) => {
  const session = new GameSession(6165, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
  })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.pastures = [
      {
        id: `pasture-${index}-a`, size: 1, tiles: [{ row: 0, col: 1 }], stables: 0,
        animalType: null, animalCount: 0,
      },
      {
        id: `pasture-${index}-b`, size: 1, tiles: [{ row: 0, col: 2 }], stables: 0,
        animalType: null, animalCount: 0,
      },
    ]
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []

  const marketId = MARKET_IDS[marketAnimal]
  moveRoundActionTo(state.roundActionOrder, marketId, marketRound)
  const market = state.actionSpaces.find((space) => space.id === marketId)!
  market.resources[marketAnimal] = marketCount
  if (occupiedRound !== null) {
    const occupiedId = state.roundActionOrder[occupiedRound - 1]
    const occupied = state.actionSpaces.find((space) => space.id === occupiedId)
    const occupant = state.players[occupiedPlayerIndex]!
    if (!occupied || !occupant.workers[0]) throw new Error(`cannot occupy round ${occupiedRound}`)
    occupied.takenBy = [{ playerId: occupant.id, workerId: occupant.workers[0].id }]
  }
  session.loadState(state)
  return session
}

const resolveAnimalReorg = (session: GameSession, response: SessionResponse) => {
  let current = response
  for (let depth = 0; depth < 3; depth += 1) {
    if (current.interaction.stateId !== 'wait'
      || current.interaction.request.kind !== 'animal-reorg') break
    const player = current.state.players[0]!
    const zones: ZoneAssignment[] = []
    if (player.resources.sheep > 0) {
      zones.push({
        id: 'pasture-0-a', zoneType: 'pasture', animalType: 'sheep',
        animalCount: player.resources.sheep,
      })
    }
    if (player.resources.boar > 0) {
      zones.push({
        id: 'pasture-0-b', zoneType: 'pasture', animalType: 'boar',
        animalCount: player.resources.boar,
      })
    }
    if (player.resources.cattle > 0) {
      zones.push({
        id: 'pasture-0-a', zoneType: 'pasture', animalType: 'cattle',
        animalCount: player.resources.cattle,
      })
    }
    current = session.resolveChoice(
      current.interaction.playerIndex,
      'confirm',
      zones as unknown as Record<string, unknown>,
    )
    expect(current.ok, current.error).toBe(true)
  }
  expect(current.interaction.stateId === 'wait'
    && current.interaction.request.kind === 'animal-reorg').toBe(false)
  return current
}

const takeMarket = (session: GameSession, animalType: MarketAnimal) => {
  const response = session.takeAction(0, MARKET_IDS[animalType])
  expect(response.ok, response.error).toBe(true)
  return resolveAnimalReorg(session, response)
}

describe('D165 Pig Stalker parity', () => {
  it('D165 S1: Pig Stalker can be played as the first occupation in a four-player game', () => {
    const session = setup({ played: false })
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId === 'wait') {
        const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
        expect(option, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(response.interaction.playerIndex, option!.value)
      }
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })

  it('D165 S2: an owner worker immediately right of Sheep Market grants one additional boar', () => {
    const response = takeMarket(setup({ marketRound: 1, occupiedRound: 2 }), 'sheep')

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
  })

  it('D165 S3: an owner worker immediately left of Pig Market grants one additional boar', () => {
    const response = takeMarket(setup({
      marketAnimal: 'boar', marketRound: 3, occupiedRound: 2,
    }), 'boar')

    expect(response.state.players[0]!.resources.boar).toBe(2)
  })

  it('D165 S4: an opponent on an adjacent round space grants no additional boar', () => {
    const response = takeMarket(setup({ occupiedRound: 2, occupiedPlayerIndex: 1 }), 'sheep')

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0 })
  })

  it('D165 S5: an owner worker on a nonadjacent round space grants no additional boar', () => {
    const response = takeMarket(setup({ occupiedRound: 3 }), 'sheep')

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0 })
  })

  it('D165 S6: consecutive Round 4 and Round 5 slots are not adjacent on the board', () => {
    const response = takeMarket(setup({ marketRound: 4, occupiedRound: 5 }), 'sheep')

    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0 })
  })

  it('D165 S7: the separate Round 8 and Round 9 row is treated as adjacent', () => {
    const response = takeMarket(setup({
      marketAnimal: 'cattle', marketRound: 8, occupiedRound: 9,
    }), 'cattle')

    expect(response.state.players[0]!.resources).toMatchObject({ cattle: 1, boar: 1 })
  })

  it('D165 S8: using a non-animal accumulation space grants no boar', () => {
    const session = setup({ occupiedRound: 2 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, boar: 0 })
  })
})
