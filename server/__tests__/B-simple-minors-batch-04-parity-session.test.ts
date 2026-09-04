import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B005_StoreofExperience'
import '../../shared/cards/B/B008_MarketStall'
import '../../shared/cards/B/B014_Hawktower'
import '../../shared/cards/B/B023_FinalScenario'
import '../../shared/cards/B/B036_Bottles'
import '../../shared/cards/B/B041_Hauberg'
import '../../shared/cards/B/B044_ChickStable'
import '../../shared/cards/B/B084_AcornsBasket'

type CardId =
  | 'B005_StoreofExperience' | 'B008_MarketStall' | 'B014_Hawktower'
  | 'B023_FinalScenario' | 'B036_Bottles' | 'B041_Hauberg'
  | 'B044_ChickStable' | 'B084_AcornsBasket'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = [
  'A116_WoodCutter', 'B121_Geologist', 'C123_Freemason', 'D152_Patron',
  'A103_Portmonger', 'B119_Lumberjack', 'C141_SheepProvider',
]

const setupMinor = ({
  cardId, resources = {}, round = 5, occupationsPlayed = 0, occupationsInHand = 0,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  round?: number
  occupationsPlayed?: number
  occupationsInHand?: number
}) => {
  const session = new GameSession(4044, undefined, { playerCount: 2 })
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
  player.minorHand = [cardId]
  player.occupationHand = OCCUPATIONS.slice(0, occupationsInHand)
  if (occupationsInHand === 0) player.occupationHand = [FILLER]
  player.occupationPlayed = OCCUPATIONS.slice(0, occupationsPlayed)
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0,
    ...resources,
  }
  const improvement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!improvement) throw new Error('major-improvement missing')
  improvement.takenBy = []
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const openImprovement = (session: GameSession, actionId: 'major-improvement' | 'meeting-place' = 'major-improvement') => {
  let response = session.takeAction(0, actionId)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value.startsWith('action-improvement-'))
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId) => {
  let response = openImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId, actionId: 'major-improvement' | 'meeting-place' = 'major-improvement') => {
  const response = openImprovement(session, actionId)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

describe('B005 Store of Experience parity', () => {
  for (const [count, reward] of [[4, 'stone'], [5, 'reed'], [6, 'clay'], [7, 'wood']] as const) {
    it(`B005 S${count - 3}: ${count} occupations in hand grant one ${reward} and pass Store of Experience`, () => {
      const response = playMinor(setupMinor({
        cardId: 'B005_StoreofExperience', occupationsInHand: count,
      }), 'B005_StoreofExperience')

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[reward]).toBe(1)
      expect(response.state.players[1]!.minorHand).toContain('B005_StoreofExperience')
    })
  }
})

describe('B008 Market Stall parity', () => {
  it('B008 S1: Market Stall pays one grain, gains one vegetable, and passes', () => {
    const response = playMinor(setupMinor({
      cardId: 'B008_MarketStall', resources: { grain: 1 },
    }), 'B008_MarketStall')

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 1 })
    expect(response.state.players[1]!.minorHand).toContain('B008_MarketStall')
  })

  it('B008 S2: no grain keeps Market Stall unavailable', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'B008_MarketStall' }), 'B008_MarketStall')).toBe(false)
  })
})

describe('B014 Hawktower parity', () => {
  it('B014 S1: Hawktower can be played through round 7 and schedules a stone room for round 12', () => {
    const response = playMinor(setupMinor({
      cardId: 'B014_Hawktower', resources: { clay: 2 }, round: 7,
    }), 'B014_Hawktower')

    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.futureMeeples).toEqual([
      expect.objectContaining({ cardId: 'B014_Hawktower', round: 12, roomType: 'stone' }),
    ])
  })

  it('B014 S2: Hawktower is unavailable after round 7', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B014_Hawktower', resources: { clay: 2 }, round: 8,
    }), 'B014_Hawktower')).toBe(false)
  })

  const due = (houseType: 'clay' | 'stone') => {
    const session = new GameSession(414, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 11
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 2)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    const player = state.players[0]!
    player.minorPlayed = ['B014_Hawktower']
    player.houseType = houseType
    state.futureMeeples = [{
      id: 'hawktower-room', cardId: 'B014_Hawktower', playerId: player.id,
      round: 12, actionId: null, resources: {}, roomType: 'stone',
    }]
    session.loadState(state)
    return session
  }

  it('B014 S3: a stone-house owner may build the scheduled stone room for free in round 12', () => {
    const session = due('stone')
    const response = session.performRoundEnd()
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.futureMeeples).toEqual([])
  })

  it('B014 S4: a non-stone-house owner discards the scheduled room in round 12', () => {
    const response = due('clay').performRoundEnd()
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(response.state.futureMeeples).toEqual([])
  })
})

describe('B023 Final Scenario parity', () => {
  it('B023 S1: Final Scenario reveals round 14 and makes it exclusive to the owner', () => {
    const session = setupMinor({ cardId: 'B023_FinalScenario', round: 13 })
    const round14Id = session.state.roundActionOrder[13]!
    const response = playMinor(session, 'B023_FinalScenario')
    const space = response.state.actionSpaces.find((entry) => entry.id === round14Id)!
    expect(space.exclusiveUse).toEqual({ playerId: response.state.players[0]!.id, sourceCardId: 'B023_FinalScenario', untilRound: 14 })
    response.state.currentPlayerIndex = 1
    session.loadState(response.state)
    expect(session.takeAction(1, round14Id).ok).toBe(false)
  })

  it('B023 S2: Final Scenario is unavailable in round 14', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'B023_FinalScenario', round: 14 }), 'B023_FinalScenario')).toBe(false)
  })

  it('B023 S3: round 14 clears Final Scenario exclusive use', () => {
    const session = setupMinor({ cardId: 'B023_FinalScenario', round: 13 })
    playMinor(session, 'B023_FinalScenario')
    const state = session.getState().state
    state.players.forEach((player) => { markAllWorkersUsed(state, player); player.resources.food = 20 })
    session.loadState(state)
    const response = session.performRoundEnd()
    const round14Id = response.state.roundActionOrder[13]!
    expect(response.state.actionSpaces.find((entry) => entry.id === round14Id)?.exclusiveUse).toBeUndefined()
  })
})

describe('B036 Bottles parity', () => {
  for (const family of [2, 3]) {
    it(`B036 S${family - 1}: ${family} people make Bottles cost ${family} clay and ${family} food`, () => {
      const session = setupMinor({ cardId: 'B036_Bottles', resources: { clay: family, food: family } })
      setActiveWorkerCount(session.state.players[0]!, family)
      setWorkersAtHome(session.state, session.state.players[0]!, family)
      session.loadState(session.state)
      const response = playMinor(session, 'B036_Bottles')
      expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })
      expect(response.state.players[0]!.minorPlayed).toContain('B036_Bottles')
      expect(familySize(response.state.players[0]!)).toBe(family)
    })
  }

  it('B036 S3: insufficient food keeps Bottles unavailable without spending clay', () => {
    const session = setupMinor({ cardId: 'B036_Bottles', resources: { clay: 2, food: 1 } })
    const offered = cardIsOffered(session, 'B036_Bottles', 'meeting-place')
    expect(offered).toBe(false)
    expect(session.state.players[0]!.resources.clay).toBe(2)
  })
})

describe('B041 Hauberg parity', () => {
  it('B041 S1: OA fixes the four-round sequence to wood, pig, wood, pig', () => {
    const response = playMinor(setupMinor({
      cardId: 'B041_Hauberg', resources: { food: 3 }, occupationsPlayed: 3, round: 5,
    }), 'B041_Hauberg')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(futureRounds(response.state, 'B041_Hauberg', 'wood')).toEqual([6, 6, 8, 8])
    expect(futureRounds(response.state, 'B041_Hauberg', 'boar')).toEqual([7, 9])
  })

  it('B041 S2: OA offers no pig-first ordering choice', () => {
    const response = playMinor(setupMinor({
      cardId: 'B041_Hauberg', resources: { food: 3 }, occupationsPlayed: 3, round: 5,
    }), 'B041_Hauberg')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('B041_Hauberg')
    expect(futureRounds(response.state, 'B041_Hauberg', 'boar')).toEqual([7, 9])
  })

  it('B041 S3: fewer than three occupations keeps Hauberg unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B041_Hauberg', resources: { food: 3 }, occupationsPlayed: 2,
    }), 'B041_Hauberg')).toBe(false)
  })

  it('B041 S4: OA clamps all late Hauberg goods onto round 14', () => {
    const response = playMinor(setupMinor({
      cardId: 'B041_Hauberg', resources: { food: 3 }, occupationsPlayed: 3, round: 13,
    }), 'B041_Hauberg')
    expect(futureRounds(response.state, 'B041_Hauberg', 'wood')).toEqual([14, 14, 14, 14])
    expect(futureRounds(response.state, 'B041_Hauberg', 'boar')).toEqual([14, 14])
  })
})

describe('B044 Chick Stable parity', () => {
  for (const [scenario, payment] of [['S1', 'wood'], ['S2', 'clay']] as const) {
    it(`B044 ${scenario}: Chick Stable can pay one ${payment} and schedules two food in rounds plus three and four`, () => {
      const response = playMinor(setupMinor({
        cardId: 'B044_ChickStable', resources: { [payment]: 1 }, round: 5,
      }), 'B044_ChickStable')
      expect(response.state.players[0]!.resources[payment]).toBe(0)
      expect(futureRounds(response.state, 'B044_ChickStable', 'food')).toEqual([8, 8, 9, 9])
    })
  }

  it('B044 S3: OA clamps both late Chick Stable placements onto round 14', () => {
    const response = playMinor(setupMinor({
      cardId: 'B044_ChickStable', resources: { wood: 1 }, round: 11,
    }), 'B044_ChickStable')
    expect(futureRounds(response.state, 'B044_ChickStable', 'food')).toEqual([14, 14, 14, 14])
  })
})

describe('B084 Acorns Basket parity', () => {
  it('B084 S1: three occupations and one reed schedule pigs for the next two rounds', () => {
    const response = playMinor(setupMinor({
      cardId: 'B084_AcornsBasket', resources: { reed: 1 }, occupationsPlayed: 3, round: 5,
    }), 'B084_AcornsBasket')
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(futureRounds(response.state, 'B084_AcornsBasket', 'boar')).toEqual([6, 7])
  })

  it('B084 S2: fewer than three occupations keeps Acorns Basket unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B084_AcornsBasket', resources: { reed: 1 }, occupationsPlayed: 2,
    }), 'B084_AcornsBasket')).toBe(false)
  })

  it('B084 S3: Acorns Basket played in round 13 schedules only one pig for round 14', () => {
    const response = playMinor(setupMinor({
      cardId: 'B084_AcornsBasket', resources: { reed: 1 }, occupationsPlayed: 3, round: 13,
    }), 'B084_AcornsBasket')
    expect(futureRounds(response.state, 'B084_AcornsBasket', 'boar')).toEqual([14])
  })
})
