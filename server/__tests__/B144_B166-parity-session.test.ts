import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/B/B144_Collier'
import '../../shared/cards/B/B145_BrushwoodCollector'
import '../../shared/cards/B/B146_Illusionist'
import '../../shared/cards/B/B148_PetBroker'
import '../../shared/cards/B/B150_LargeScaleFarmer'
import '../../shared/cards/B/B151_LittlePeasant'
import '../../shared/cards/B/B152_JuniorArtist'
import '../../shared/cards/B/B153_Housemaster'
import '../../shared/cards/B/B155_ArtTeacher'
import '../../shared/cards/B/B156_StorehouseKeeper'
import '../../shared/cards/B/B159_LieutenantGeneral'
import '../../shared/cards/B/B161_Weakling'
import '../../shared/cards/B/B162_ForestClearer'
import '../../shared/cards/B/B163_Pastor'
import '../../shared/cards/B/B166_CattleFeeder'

const FILLER = '__test_placeholder__'
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  cardId, played = true, playerCount = 4, round = 5, resources = {},
}: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  resources?: Record<string, number>
}) => {
  const session = new GameSession(7700 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === cardId)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const acceptCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  if (response.interaction.stateId !== 'wait') return response
  const choice = options(response).find((option) => option.sourceCard === cardId && option.value !== '__skip__')
    ?? options(response).find((option) => option.value !== '__skip__')
  expect(choice, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, choice!.value)
}

const declineCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  if (response.interaction.stateId === 'wait') {
    const skip = options(response).find((option) => option.value === '__skip__')
    if (skip) response = session.resolveChoice(response.interaction.playerIndex, skip.value)
  }
  return response
}

const chooseByText = (session: GameSession, response: SessionResponse, text: string) => {
  expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const choice = options(response).find((option) => JSON.stringify(option).toLowerCase().includes(text.toLowerCase()))
  expect(choice, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, choice!.value)
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
    if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  return response
}

describe('B144 Collier parity', () => {
  it('B144 S1: Collier can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B144_Collier', played: false, playerCount: 3 }), 'B144_Collier')
      .state.players[0]!.occupationPlayed).toContain('B144_Collier')
  })
  it.each([
    { scenario: 'S2', space: 'clay-pit', reed: 1 },
    { scenario: 'S3', space: 'hollow-4', reed: 0 },
  ])('B144 $scenario: $space grants its clay plus Collier goods', ({ space, reed }) => {
    const session = setup({ cardId: 'B144_Collier', playerCount: 4 })
    const target = session.state.actionSpaces.find((entry) => entry.id === space)!
    target.resources.clay = 2
    session.loadState(session.state)
    const response = session.takeAction(0, space)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, wood: 1, reed })
  })
  it('B144 S4: another action grants no Collier goods', () => {
    const response = setup({ cardId: 'B144_Collier', playerCount: 3 }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })
})

describe('B145 Brushwood Collector parity', () => {
  it('B145 S1: Brushwood Collector can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B145_BrushwoodCollector', played: false, playerCount: 3 }), 'B145_BrushwoodCollector')
      .state.players[0]!.occupationPlayed).toContain('B145_BrushwoodCollector')
  })
  it('B145 S2: one extra wood replaces two reed when building a wooden room', () => {
    const session = setup({ cardId: 'B145_BrushwoodCollector', playerCount: 3, resources: { wood: 6 } })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.kind !== 'farm-select') return
    const response = session.commitSelectionChoice(0, { rooms: [selection.interaction.request.farm.selectableTiles[0]!] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0 } })
  })
  it('B145 S3: one wood replaces one reed when renovating two rooms', () => {
    const session = setup({ cardId: 'B145_BrushwoodCollector', playerCount: 3, resources: { clay: 2, wood: 1 } })
    let response = session.takeAction(0, 'house-redevelopment')
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(0, 'clay')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ houseType: 'clay', resources: { clay: 0, wood: 0, reed: 0 } })
  })
  it('B145 S4: a wooden room may still be built for its normal wood and reed cost', () => {
    const session = setup({
      cardId: 'B145_BrushwoodCollector', playerCount: 3, resources: { wood: 5, reed: 2 },
    })
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.kind !== 'farm-select') return
    const response = session.commitSelectionChoice(0, {
      rooms: [selection.interaction.request.farm.selectableTiles[0]!],
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0 } })
  })
})

describe('B146 Illusionist parity', () => {
  it('B146 S1: Illusionist can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B146_Illusionist', played: false, playerCount: 3 }), 'B146_Illusionist')
      .state.players[0]!.occupationPlayed).toContain('B146_Illusionist')
  })
  const illusionist = (accept: boolean, space = 'forest', withHand = true) => {
    const session = setup({ cardId: 'B146_Illusionist', playerCount: 3 })
    session.state.players[0]!.occupationHand = withHand ? ['A116_WoodCutter'] : []
    session.state.players[0]!.minorHand = []
    session.state.actionSpaces.find((entry) => entry.id === space)!.resources = {
      ...session.state.actionSpaces.find((entry) => entry.id === space)!.resources,
      ...(space === 'forest' ? { wood: 3 } : { food: 2 }),
    }
    let response = session.takeAction(0, space)
    if (JSON.stringify(response.interaction).includes('B146_Illusionist')) {
      response = accept
        ? acceptCard(session, response, 'B146_Illusionist')
        : declineCard(session, response, 'B146_Illusionist')
    }
    if (accept && response.interaction.stateId === 'wait'
      && options(response).some((option) => JSON.stringify(option).includes('A116_WoodCutter'))) {
      response = chooseByText(session, response, 'A116_WoodCutter')
    }
    return response
  }
  it('B146 S2: a hand card may be discarded for one extra accumulating resource', () => {
    const response = illusionist(true)
    expect(response.state.players[0]!.occupationHand).not.toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources.wood).toBe(4)
  })
  it('B146 S3: the Illusionist discard may be declined', () => {
    const response = illusionist(false)
    expect(response.state.players[0]!.occupationHand).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources.wood).toBe(3)
  })
  it('B146 S4: an empty hand or food accumulation grants no Illusionist bonus', () => {
    expect(illusionist(true, 'forest', false).state.players[0]!.resources.wood).toBe(3)
    const food = illusionist(true, 'fishing', true)
    expect(food.state.players[0]!.occupationHand).toContain('A116_WoodCutter')
  })
})

describe('B148 Pet Broker parity', () => {
  it('B148 S1: playing Pet Broker immediately gains one sheep', () => {
    const response = playOccupation(setup({ cardId: 'B148_PetBroker', played: false }), 'B148_PetBroker')
    expect(response.state.players[0]!.occupationPlayed).toContain('B148_PetBroker')
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })
  it('B148 S2: Pet Broker sheep capacity equals occupations in play', () => {
    const session = setup({ cardId: 'B148_PetBroker' })
    const owner = session.state.players[0]!
    owner.occupationPlayed.push('A116_WoodCutter', 'B121_Geologist')
    owner.resources.sheep = 3
    session.loadState(session.state)
    const response = session.takeAction(0, 'day-laborer')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return
    expect(response.interaction.request.zones).toContainEqual(expect.objectContaining({
      id: 'card:B148_PetBroker', capacity: 3, animalType: 'sheep',
    }))
  })
})

describe('B150 Large-Scale Farmer parity', () => {
  it('B150 S1: Large-Scale Farmer can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B150_LargeScaleFarmer', played: false }), 'B150_LargeScaleFarmer')
      .state.players[0]!.occupationPlayed).toContain('B150_LargeScaleFarmer')
  })
  const afterFarmExpansion = (food: number, occupied = false) => {
    const session = setup({ cardId: 'B150_LargeScaleFarmer', round: 14, resources: { wood: 2, food, clay: 2 } })
    session.state.availableMajorImprovements = ['Major_Fireplace1']
    if (occupied) {
      const opponent = session.state.players[1]!
      session.state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = [{ playerId: opponent.id, workerId: '1' }]
    }
    session.loadState(session.state)
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = chooseByText(session, response, 'stables')
    }
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(0, { stables: [response.interaction.request.farm.selectableTiles[0]!] })
    }
    return { session, response }
  }
  it('B150 S2: Farm Expansion may pay one food and move the same person to Major Improvement', () => {
    const { session, response: afterExpansion } = afterFarmExpansion(1)
    let response = acceptCard(session, afterExpansion, 'B150_LargeScaleFarmer')
    if (response.interaction.stateId === 'wait'
      && options(response).some((option) => option.value === 'Major_Fireplace1')) {
      response = chooseByText(session, response, 'Major_Fireplace1')
    }
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
  })
  it('B150 S3: the Large-Scale Farmer jump may be declined', () => {
    const { session, response } = afterFarmExpansion(1)
    const declined = declineCard(session, response, 'B150_LargeScaleFarmer')
    expect(declined.state.players[0]!.resources.food).toBe(1)
  })
  it.each([{ label: 'occupied target', food: 1, occupied: true }, { label: 'missing food', food: 0, occupied: false }])(
    'B150 S4: $label suppresses the jump', ({ food, occupied }) => {
      const { response } = afterFarmExpansion(food, occupied)
      expect(JSON.stringify(response.interaction)).not.toContain('B150_LargeScaleFarmer')
    })
})

describe('B151 Little Peasant parity', () => {
  it('B151 S1: playing Little Peasant immediately gains one stone', () => {
    const response = playOccupation(setup({ cardId: 'B151_LittlePeasant', played: false }), 'B151_LittlePeasant')
    expect(response.state.players[0]!.occupationPlayed).toContain('B151_LittlePeasant')
    expect(response.state.players[0]!.resources.stone).toBe(1)
  })
  const occupied = (houseType: 'wood' | 'clay', rooms: number, space = 'day-laborer') => {
    const session = setup({ cardId: 'B151_LittlePeasant' })
    const owner = session.state.players[0]!; owner.houseType = houseType; owner.rooms = rooms
    const opponent = session.state.players[1]!
    session.state.actionSpaces.find((entry) => entry.id === space)!.takenBy = [{ playerId: opponent.id, workerId: '1' }]
    session.loadState(session.state)
    return session
  }
  it('B151 S2: a two-room wooden house may reuse an occupied non-Meeting space', () => {
    const response = occupied('wood', 2).takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })
  it('B151 S3: occupied Meeting Place cannot be reused', () => {
    expect(occupied('wood', 2, 'meeting-place').getState().actionAvailability?.['meeting-place']).toBe(false)
  })
  it.each([{ houseType: 'clay' as const, rooms: 2 }, { houseType: 'wood' as const, rooms: 3 }])(
    'B151 S4: $houseType house with $rooms rooms loses the privilege', ({ houseType, rooms }) => {
      expect(occupied(houseType, rooms).getState().actionAvailability?.['day-laborer']).toBe(false)
    })
})

describe('B152 Junior Artist parity', () => {
  it('B152 S1: Junior Artist can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B152_JuniorArtist', played: false }), 'B152_JuniorArtist')
      .state.players[0]!.occupationPlayed).toContain('B152_JuniorArtist')
  })
  const junior = (food: number, blockTargets = false) => {
    const session = setup({ cardId: 'B152_JuniorArtist', resources: { food } })
    const tp = session.state.actionSpaces.find((space) => space.id === 'traveling-players')!
    tp.resources.food = 3
    if (blockTargets) {
      session.state.players[0]!.occupationHand = []
      for (const [index, id] of ['lessons', 'lessons-4', 'traveling-players'].entries()) {
        const player = session.state.players[index + 1]!
        session.state.actionSpaces.find((space) => space.id === id)!.takenBy = [{ playerId: player.id, workerId: '1' }]
      }
    }
    session.loadState(session.state)
    return session
  }
  it('B152 S2: Day Laborer may pay one food and move the same person to Traveling Players', () => {
    const session = junior(1)
    let response = acceptCard(session, session.takeAction(0, 'day-laborer'), 'B152_JuniorArtist')
    if (response.interaction.stateId === 'wait'
      && options(response).some((option) => JSON.stringify(option).includes('traveling-players'))) {
      response = chooseByText(session, response, 'traveling-players')
    }
    expect(response.state.players[0]!.resources.food).toBe(5)
    expect(response.state.actionSpaces.find((space) => space.id === 'traveling-players')!.takenBy
      .some((ref) => ref.playerId === response.state.players[0]!.id)).toBe(true)
  })
  it('B152 S3: the Junior Artist jump may be declined', () => {
    const session = junior(1)
    const response = declineCard(session, session.takeAction(0, 'day-laborer'), 'B152_JuniorArtist')
    expect(response.state.players[0]!.resources.food).toBe(3)
  })
  it('B152 S4: occupied Lessons and Traveling Players suppress Junior Artist', () => {
    const response = junior(0, true).takeAction(0, 'day-laborer')
    expect(JSON.stringify(response.interaction)).not.toContain('B152_JuniorArtist')
  })
})

describe('B153 Housemaster parity', () => {
  it('B153 S1: Housemaster can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B153_Housemaster', played: false }), 'B153_Housemaster')
      .state.players[0]!.occupationPlayed).toContain('B153_Housemaster')
  })
  it.each([
    { scenario: 'S2', majors: ['Major_Well'], score: 2 },
    { scenario: 'S3', majors: ['Major_Well', 'Major_Fireplace1'], score: 1 },
    { scenario: 'S4', majors: ['Major_Well', 'Major_Joinery'], score: 2 },
    { scenario: 'S5', majors: ['Major_Well', 'Major_Joinery', 'Major_Pottery'], score: 3 },
    { scenario: 'S6', majors: ['Major_Well', 'Major_Joinery', 'Major_Pottery', 'Major_Basket'], score: 4 },
  ])('B153 $scenario: Housemaster doubles the smallest major value for threshold scoring', ({ majors, score }) => {
    const session = setup({ cardId: 'B153_Housemaster', round: 14 })
    session.state.players[0]!.improvements = majors
    session.loadState(session.state)
    const bonus = session.getState().scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
      .find((entry) => entry.type === 'bonus' && entry.cardId === 'B153_Housemaster')?.score ?? 0
    expect(bonus).toBe(score)
  })
})

describe('B155 Art Teacher parity', () => {
  it('B155 S1: playing Art Teacher immediately gains one wood and one reed', () => {
    const session = setup({ cardId: 'B155_ArtTeacher', played: false })
    let response = playOccupation(session, 'B155_ArtTeacher')
    response = resolveTriggerIfPresent(session, response, 'B155_ArtTeacher')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 1 })
  })
  it('B155 S2: Traveling Players food can pay a later occupation cost', () => {
    const session = setup({ cardId: 'B155_ArtTeacher' })
    const owner = session.state.players[0]!
    owner.occupationPlayed.push('A123_FrameBuilder'); owner.occupationHand = ['A153_PigOwner']
    session.state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food = 1
    session.loadState(session.state)
    const response = session.takeAction(0, 'lessons')
    expect(response.state.players[0]!.occupationPlayed).toContain('A153_PigOwner')
    expect(response.state.actionSpaces.find((space) => space.id === 'traveling-players')!.resources.food).toBe(0)
  })
})

describe('B156 Storehouse Keeper parity', () => {
  it('B156 S1: Storehouse Keeper can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B156_StorehouseKeeper', played: false }), 'B156_StorehouseKeeper')
      .state.players[0]!.occupationPlayed).toContain('B156_StorehouseKeeper')
  })
  it.each([{ scenario: 'S2', resource: 'clay' }, { scenario: 'S3', resource: 'grain' }])(
    'B156 $scenario: Resource Market may gain one $resource', ({ resource }) => {
      const session = setup({ cardId: 'B156_StorehouseKeeper' })
      let response = session.takeAction(0, 'resource-market-4')
      response = resolveTriggerIfPresent(session, response, 'B156_StorehouseKeeper')
      if (response.interaction.stateId === 'wait') response = chooseByText(session, response, resource)
      expect(response.state.players[0]!.resources[resource]).toBe(1)
    })
  it('B156 S4: another action grants no Storehouse Keeper choice', () => {
    const response = setup({ cardId: 'B156_StorehouseKeeper' }).takeAction(0, 'forest')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, grain: 0 })
  })
})

describe('B159 Lieutenant General parity', () => {
  const plow = (round: number, adjacent: boolean) => {
    const session = setup({ cardId: 'B159_LieutenantGeneral', round })
    const actor = session.state.players[1]!
    session.state.actionSpaces.forEach((space) => {
      space.takenBy = space.takenBy.filter((ref) => ref.playerId !== actor.id)
    })
    setActiveWorkerCount(actor, 2)
    setWorkersAtHome(session.state, actor, 2)
    if (adjacent) actor.fields = [{ row: 0, col: 2, crop: null, remaining: 0 }]
    session.state.currentPlayerIndex = 1
    session.loadState(session.state)
    let response = session.takeAction(1, 'farmland')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(1, { tile: response.interaction.request.farm.selectableTiles[0]! })
      expect(response.ok, response.error).toBe(true)
    }
    while (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
    }
    response = resolveTriggerIfPresent(session, response, 'B159_LieutenantGeneral')
    return response
  }
  it('B159 S1: Lieutenant General can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B159_LieutenantGeneral', played: false }), 'B159_LieutenantGeneral')
      .state.players[0]!.occupationPlayed).toContain('B159_LieutenantGeneral')
  })
  it.each([{ scenario: 'S2', round: 13, resource: 'food' }, { scenario: 'S3', round: 14, resource: 'grain' }])(
    'B159 $scenario: opponent adjacent plow grants one $resource', ({ round, resource }) => {
      const response = plow(round, true)
      expect(response.state.players[0]!.resources[resource], JSON.stringify({
        interaction: response.interaction,
        ownerCards: response.state.players[0]!.occupationPlayed,
        actorFields: response.state.players[1]!.fields,
        log: response.state.log.slice(-10),
      })).toBe(1)
    })
  it('B159 S4: an opponent first isolated field grants no reward', () => {
    expect(plow(13, false).state.players[0]!.resources.food).toBe(0)
  })
})

describe('B161 Weakling parity', () => {
  const weakling = (forestWood: number, useForest: boolean) => {
    const session = setup({ cardId: 'B161_Weakling' })
    session.state.actionSpaces.forEach((space) => {
      for (const key of Object.keys(space.resources)) space.resources[key] = 0
    })
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = forestWood
    session.loadState(session.state)
    return session.takeAction(0, useForest ? 'forest' : 'day-laborer')
  }
  it('B161 S1: Weakling can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B161_Weakling', played: false }), 'B161_Weakling')
      .state.players[0]!.occupationPlayed).toContain('B161_Weakling')
  })
  it('B161 S2: avoiding a five-good accumulation space gains one vegetable', () => {
    expect(weakling(5, false).state.players[0]!.resources.vegetable).toBe(1)
  })
  it('B161 S3: using the five-good space or having none grants no vegetable', () => {
    expect(weakling(5, true).state.players[0]!.resources.vegetable).toBe(0)
    expect(weakling(0, false).state.players[0]!.resources.vegetable).toBe(0)
  })
})

describe('B162 Forest Clearer parity', () => {
  const collect = (wood: number) => {
    const session = setup({ cardId: 'B162_ForestClearer' })
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = wood
    session.loadState(session.state)
    let response = session.takeAction(0, 'forest')
    response = resolveTriggerIfPresent(session, response, 'B162_ForestClearer')
    return response
  }
  it('B162 S1: Forest Clearer can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B162_ForestClearer', played: false }), 'B162_ForestClearer')
      .state.players[0]!.occupationPlayed).toContain('B162_ForestClearer')
  })
  it.each([
    { scenario: 'S2', taken: 2, wood: 3, food: 1 },
    { scenario: 'S3', taken: 3, wood: 4, food: 0 },
    { scenario: 'S4', taken: 4, wood: 5, food: 1 },
  ])('B162 $scenario: taking $taken wood gains the printed bonus', ({ taken, wood, food }) => {
    expect(collect(taken).state.players[0]!.resources).toMatchObject({ wood, food })
  })
  it('B162 S5: taking one or five wood grants no Forest Clearer bonus', () => {
    for (const wood of [1, 5]) expect(collect(wood).state.players[0]!.resources).toMatchObject({ wood, food: 0 })
  })
})

describe('B163 Pastor parity', () => {
  it('B163 S1: playing Pastor while uniquely at two rooms grants its bundle', () => {
    const session = setup({ cardId: 'B163_Pastor', played: false })
    session.state.players.slice(1).forEach((player) => { player.rooms = 3 })
    session.loadState(session.state)
    const response = playOccupation(session, 'B163_Pastor')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2, reed: 1, stone: 1 })
  })
  it('B163 S2: another player also at two rooms suppresses the bundle', () => {
    const response = playOccupation(setup({ cardId: 'B163_Pastor', played: false }), 'B163_Pastor')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
  })
  const buildRoomFor = (session: GameSession, playerIndex: number) => {
    const actor = session.state.players[playerIndex]!
    session.state.actionSpaces.forEach((space) => {
      space.takenBy = space.takenBy.filter((ref) => ref.playerId !== actor.id)
    })
    setActiveWorkerCount(actor, 2)
    setWorkersAtHome(session.state, actor, 2)
    Object.assign(actor.resources, { wood: 5, reed: 2 })
    session.state.currentPlayerIndex = playerIndex
    session.loadState(session.state)
    let response = session.takeAction(playerIndex, 'farm-expansion')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const construct = options(response).find((option) => option.labelKey === 'actions.construct.name')
      expect(construct, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, construct!.value)
    }
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } },
    })
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(
        response.interaction.playerIndex, { rooms: [response.interaction.request.farm.selectableTiles[0]!] },
      )
    }
    while (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
    }
    return response
  }
  it('B163 S3: an opponents later room construction can make the owner uniquely at two rooms', () => {
    const session = setup({ cardId: 'B163_Pastor', played: false })
    session.state.players[2]!.rooms = 3
    session.state.players[3]!.rooms = 3
    session.loadState(session.state)
    const played = playOccupation(session, 'B163_Pastor')
    expect(played.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0 })
    const response = buildRoomFor(session, 1)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2, reed: 1, stone: 1 })
  })
  it('B163 S4: a later room construction cannot award the Pastor bundle twice', () => {
    const session = setup({ cardId: 'B163_Pastor', played: false })
    session.state.players.slice(1).forEach((player) => { player.rooms = 3 })
    session.loadState(session.state)
    const played = playOccupation(session, 'B163_Pastor')
    expect(played.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2, reed: 1, stone: 1 })
    const response = buildRoomFor(session, 1)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2, reed: 1, stone: 1 })
  })
})

describe('B166 Cattle Feeder parity', () => {
  const cattle = (food: number, accept: boolean) => {
    const session = setup({ cardId: 'B166_CattleFeeder', round: 10, resources: { food } })
    session.state.players[0]!.pastures = [{
      id: 'p1', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: null, animalCount: 0,
    }]
    session.loadState(session.state)
    let response = session.takeAction(0, 'grain-seeds')
    response = accept ? acceptCard(session, response, 'B166_CattleFeeder') : declineCard(session, response, 'B166_CattleFeeder')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'p1', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 }] })
    }
    return response
  }
  it('B166 S1: Cattle Feeder can be played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: 'B166_CattleFeeder', played: false }), 'B166_CattleFeeder')
      .state.players[0]!.occupationPlayed).toContain('B166_CattleFeeder')
  })
  it('B166 S2: Grain Seeds may buy one cattle for one food', () => {
    const response = cattle(1, true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, cattle: 1 })
  })
  it('B166 S3: the purchase may be declined or is unavailable without food', () => {
    expect(cattle(1, false).state.players[0]!.resources).toMatchObject({ food: 1, cattle: 0 })
    expect(cattle(0, false).state.players[0]!.resources.cattle).toBe(0)
  })
})
