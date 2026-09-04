import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { familySize, setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B086_TruffleSearcher'
import '../../shared/cards/B/B092_LittleStickKnitter'
import '../../shared/cards/B/B098_OrganicFarmer'
import '../../shared/cards/B/B103_FieldMerchant'
import '../../shared/cards/B/B107_Manservant'
import '../../shared/cards/B/B112_Silokeeper'
import '../../shared/cards/B/B120_Sweep'
import '../../shared/cards/B/B147_Huntsman'

type CardId =
  | 'B086_TruffleSearcher'
  | 'B092_LittleStickKnitter'
  | 'B098_OrganicFarmer'
  | 'B103_FieldMerchant'
  | 'B107_Manservant'
  | 'B112_Silokeeper'
  | 'B120_Sweep'
  | 'B147_Huntsman'

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
  const session = new GameSession(4047, undefined, { playerCount })
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

const resolveNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = current.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, option!.value)
}

const resolveSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  expect(current.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
  return session.resolveChoice(current.interaction.playerIndex, '__skip__')
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

const setSpaceResource = (state: GameState, spaceId: string, resource: keyof Resource, count: number) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.resources[resource] = count
  space.takenBy = []
}

const cardBonusScore = (response: SessionResponse, cardId: CardId) =>
  response.scores?.[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === cardId)?.score ?? 0

describe('B092 Little Stick Knitter parity', () => {
  it('B092 S1: playing through Lessons keeps it in play', () => {
    const response = playOccupation(setupOccupation('B092_LittleStickKnitter'), 'B092_LittleStickKnitter')
    expect(response.state.players[0]!.occupationPlayed).toContain('B092_LittleStickKnitter')
  })

  const sheepMarketSession = (round: number) => {
    const session = setupOccupation('B092_LittleStickKnitter', { played: true, round })
    const state = session.getState().state
    const player = state.players[0]!
    player.rooms = 3
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]
    setSpaceResource(state, 'sheep-market', 'sheep', 1)
    session.loadState(state)
    return session
  }

  const placeMarketSheep = (session: GameSession, response: SessionResponse) => {
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      return response
    }
    const house = response.interaction.request.zones.find((zone) => zone.zoneType === 'house')
    expect(house).toBeDefined()
    return session.resolveChoice(0, 'confirm', {
      zones: [{ ...house!, animalType: 'sheep', animalCount: 1 }],
    })
  }

  it('B092 S2: accepting the round-five Sheep Market effect grows the family', () => {
    const session = sheepMarketSession(5)
    const before = familySize(session.state.players[0]!)
    const first = placeMarketSheep(session, session.takeAction(0, 'sheep-market'))
    const response = resolveNonSkip(session, first, 'B092_LittleStickKnitter')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
  })

  it('B092 S3: Little Stick Knitter family growth may be declined', () => {
    const session = sheepMarketSession(5)
    const before = familySize(session.state.players[0]!)
    const first = placeMarketSheep(session, session.takeAction(0, 'sheep-market'))
    const response = resolveSkip(session, first, 'B092_LittleStickKnitter')
    expect(familySize(response.state.players[0]!)).toBe(before)
  })

  it('B092 S4: Sheep Market before round five grants no family growth', () => {
    const session = sheepMarketSession(4)
    const before = familySize(session.state.players[0]!)
    const response = session.takeAction(0, 'sheep-market')
    expect(familySize(response.state.players[0]!)).toBe(before)
    expect(response.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card.triggered', sourceCardId: 'B092_LittleStickKnitter' }),
    ]))
  })
})

describe('B120 Sweep parity', () => {
  it('B120 S1: in round twelve using Day Laborer gains two clay before its action', () => {
    const response = setupOccupation('B120_Sweep', { played: true, round: 12 }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('B120 S2: a nonmatching space in round twelve grants no clay', () => {
    const response = setupOccupation('B120_Sweep', { played: true, round: 12 }).takeAction(0, 'fishing')
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('B120 S3: Sweep has no target before round five', () => {
    const response = setupOccupation('B120_Sweep', { played: true, round: 4 }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })
})

describe('B112 Silokeeper parity', () => {
  it('B112 S1: in round five using the round-four action space gains one grain', () => {
    const session = setupOccupation('B112_Silokeeper', {
      played: true, round: 5, resources: { clay: 2, reed: 1 },
    })
    session.state.roundActionOrder[3] = 'house-redevelopment'
    session.loadState(session.state)
    const response = session.takeAction(0, 'house-redevelopment')
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('B112 S2: a different action space in round five grants no grain', () => {
    const response = setupOccupation('B112_Silokeeper', { played: true, round: 5 }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('B112 S3: Silokeeper has no trigger before the first harvest', () => {
    const response = setupOccupation('B112_Silokeeper', {
      played: true, round: 4, resources: { clay: 2, reed: 1 },
    }).takeAction(0, 'house-redevelopment')
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('B086 Truffle Searcher parity', () => {
  const pigMarket = (completedFeedingPhases: number) => {
    const session = setupOccupation('B086_TruffleSearcher', { played: true, round: 5 })
    const state = session.getState().state
    state.completedFeedingPhases = completedFeedingPhases
    session.loadState(state)
    return session.devSetResources(0, { boar: 4 })
  }

  it('B086 S1: completed feeding phases create equal pig capacity on Truffle Searcher', () => {
    const response = pigMarket(2)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.kind).toBe('animal-reorg')
    const zone = response.interaction.request.kind === 'animal-reorg'
      ? response.interaction.request.zones.find((candidate) => candidate.cardId === 'B086_TruffleSearcher')
      : undefined
    expect(zone).toMatchObject({ zoneType: 'card', capacity: 2, allowedAnimalType: 'boar' })
  })

  it('B086 S2: zero completed feeding phases provide no Truffle Searcher animal zone', () => {
    const response = pigMarket(0)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return
    expect(response.interaction.request.zones.some((zone) => zone.cardId === 'B086_TruffleSearcher')).toBe(false)
  })
})

describe('B107 Manservant parity', () => {
  const setHouse = (state: GameState, houseType: 'wood' | 'clay' | 'stone') => {
    const player = state.players[0]!
    player.houseType = houseType
    player.rooms = 2
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
  }

  it('B107 S1: playing in a stone house schedules three food on every remaining round', () => {
    const session = setupOccupation('B107_Manservant', { round: 11 })
    setHouse(session.state, 'stone')
    session.loadState(session.state)
    const response = playOccupation(session, 'B107_Manservant')
    expect(futureRounds(response.state, 'B107_Manservant', 'food')).toEqual([
      12, 12, 12, 13, 13, 13, 14, 14, 14,
    ])
  })

  it('B107 S2: playing before living in stone schedules no food', () => {
    const response = playOccupation(setupOccupation('B107_Manservant', { round: 11 }), 'B107_Manservant')
    expect(futureRounds(response.state, 'B107_Manservant', 'food')).toEqual([])
  })

  it('B107 S3: renovating from clay to stone schedules three food on each remaining round', () => {
    const session = setupOccupation('B107_Manservant', {
      played: true, round: 11, resources: { stone: 2, reed: 1 },
    })
    setHouse(session.state, 'clay')
    session.loadState(session.state)
    let response = session.takeAction(0, 'farm-redevelopment')
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(0, 'stone')
    }
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(futureRounds(response.state, 'B107_Manservant', 'food')).toEqual([
      12, 12, 12, 13, 13, 13, 14, 14, 14,
    ])
  })
})

describe('B103 Field Merchant parity', () => {
  it('B103 S1: playing immediately gains one wood and one reed', () => {
    const response = playOccupation(setupOccupation('B103_FieldMerchant'), 'B103_FieldMerchant')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 1 })
  })

  it('B103 S2: declining a Minor Improvement action gains one food', () => {
    const session = setupOccupation('B103_FieldMerchant', { played: true, round: 5 })
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') throw new Error('expected improvement branch')
    const improvement = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(improvement).toBeDefined()
    response = session.resolveChoice(0, improvement!.value)
    if (response.interaction.stateId !== 'wait') throw new Error('expected Field Merchant branch')
    const merchant = response.interaction.request.options?.find((option) => option.sourceCard === 'B103_FieldMerchant')
    expect(merchant?.effectPreview?.resourcesGained).toMatchObject({ food: 1 })
    response = session.resolveChoice(0, merchant!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 0 })
  })

  it('B103 S3: declining a Major or Minor Improvement action may gain one vegetable', () => {
    const session = setupOccupation('B103_FieldMerchant', { played: true, round: 14 })
    const response = session.takeAction(0, 'major-improvement')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const merchant = response.interaction.request.options?.find((option) =>
      option.sourceCard === 'B103_FieldMerchant' && option.effectPreview?.resourcesGained?.vegetable === 1,
    )
    expect(merchant).toBeDefined()
    const chosen = session.resolveChoice(0, merchant!.value)
    expect(chosen.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
  })
})

describe('B147 Huntsman parity', () => {
  const forestSession = (grain: number) => {
    const session = setupOccupation('B147_Huntsman', {
      playerCount: 3, played: true, round: 5, resources: { grain },
    })
    setSpaceResource(session.state, 'forest', 'wood', 3)
    session.loadState(session.state)
    return session
  }

  it('B147 S1: after taking a wood accumulation space one grain can be paid for one pig', () => {
    const session = forestSession(1)
    const response = resolveNonSkip(session, session.takeAction(0, 'forest'), 'B147_Huntsman')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, boar: 1 })
  })

  it('B147 S2: declining Huntsman preserves grain and gains no pig', () => {
    const session = forestSession(1)
    const response = resolveSkip(session, session.takeAction(0, 'forest'), 'B147_Huntsman')
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, boar: 0 })
  })

  it('B147 S3: taking a non-wood accumulation space does not offer Huntsman', () => {
    const response = setupOccupation('B147_Huntsman', {
      playerCount: 3, played: true, round: 5, resources: { grain: 1 },
    }).takeAction(0, 'clay-pit')
    expect(response.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card.triggered', sourceCardId: 'B147_Huntsman' }),
    ]))
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })
})

describe('B098 Organic Farmer parity', () => {
  const scorePasture = (withStable: boolean) => {
    const session = setupOccupation('B098_OrganicFarmer', { played: true })
    const player = session.state.players[0]!
    player.pastures = [{
      id: 'p1', size: 1, tiles: [{ row: 0, col: 1 }], stables: withStable ? 1 : 0,
      animalType: 'sheep', animalCount: 1,
    }]
    player.stableTiles = withStable ? [{ row: 0, col: 1 }] : []
    session.loadState(session.state)
    return session.getState()
  }

  it('B098 S1: an occupied pasture with capacity for three more animals scores one bonus point', () => {
    expect(cardBonusScore(scorePasture(true), 'B098_OrganicFarmer')).toBe(1)
  })

  it('B098 S2: an occupied pasture with fewer than three empty capacity scores no bonus point', () => {
    expect(cardBonusScore(scorePasture(false), 'B098_OrganicFarmer')).toBe(0)
  })
})
