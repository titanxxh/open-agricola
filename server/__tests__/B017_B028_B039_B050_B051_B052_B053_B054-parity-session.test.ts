import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/B/B017_ForestPlow'
import '../../shared/cards/B/B028_ForestryStudies'
import '../../shared/cards/B/B039_Loom'
import '../../shared/cards/B/B050_ButterChurn'
import '../../shared/cards/B/B051_DiggingSpade'
import '../../shared/cards/B/B052_GrowingFarm'
import '../../shared/cards/B/B053_SculptureCourse'
import '../../shared/cards/B/B054_Tumbrel'

const FILLER = '__test_placeholder__'
type ResourceName = 'wood' | 'clay' | 'reed' | 'stone' | 'food' | 'grain' | 'vegetable' | 'sheep' | 'boar' | 'cattle'

const setup = ({
  cardId, played = true, round = 5, playerCount = 2, occupations = 0, resources = {},
}: {
  cardId: string
  played?: boolean
  round?: number
  playerCount?: number
  occupations?: number
  resources?: Partial<Record<ResourceName, number>>
}) => {
  const session = new GameSession(7200 + round, undefined, { playerCount })
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
    player.stableAnimals = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason', 'D116_TreeInspector']
    .slice(0, occupations)
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait' && !options(response).some((option) => option.value === cardId)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === cardId)
  return card ? session.resolveChoice(response.interaction.playerIndex, card.value) : response
}

const acceptTrigger = (session: GameSession, response: SessionResponse, cardId: string) => {
  response = resolveTriggerIfPresent(session, response, cardId)
  if (response.interaction.stateId !== 'wait') return response
  const accept = options(response).find((option) => option.sourceCard === cardId && option.value !== '__skip__')
    ?? (response.interaction.sourceCard === cardId
      ? options(response).find((option) => option.value !== '__skip__') : undefined)
  expect(accept, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

const endRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

describe('B017 Forest Plow parity', () => {
  it('B017 S1: paying one wood plays Forest Plow', () => {
    const session = setup({ cardId: 'B017_ForestPlow', played: false, resources: { wood: 1 } })
    const response = playMinor(session, 'B017_ForestPlow')
    expect(response.state.players[0]!.minorPlayed).toContain('B017_ForestPlow')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  const exercise = (forestWood: number, suppliedWood: number, accept: boolean, spaceId = 'forest') => {
    const session = setup({ cardId: 'B017_ForestPlow', playerCount: spaceId === 'grove' ? 4 : 2, resources: { wood: suppliedWood } })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === spaceId)!.resources.wood = forestWood
    session.loadState(state)
    let response = session.takeAction(0, spaceId)
    response = resolveTriggerIfPresent(session, response, 'B017_ForestPlow')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(0, accept
        ? options(response).find((option) => option.value !== '__skip__')!.value : '__skip__')
    }
    if (accept && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
      response = session.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
    }
    return response
  }

  it('B017 S2: after a wood accumulation two wood may be returned to plow one field', () => {
    const response = exercise(3, 0, true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(2)
    expect(response.state.players[0]!.fields).toHaveLength(1)
  })

  it('B017 S3: the Forest Plow exchange may be declined', () => {
    const response = exercise(3, 0, false)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })

  it('B017 S4: one collected wood plus one supplied wood can pay Forest Plow', () => {
    const response = exercise(1, 1, true, 'grove')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'grove')!.resources.wood).toBe(2)
  })

  it('B017 S5: a non-wood accumulation space does not trigger Forest Plow', () => {
    const session = setup({ cardId: 'B017_ForestPlow', resources: { wood: 2 } })
    const response = session.takeAction(0, 'clay-pit')
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'B017_ForestPlow').toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })
})

describe('B028 Forestry Studies parity', () => {
  it('B028 S1: paying two food plays Forestry Studies', () => {
    const response = playMinor(setup({ cardId: 'B028_ForestryStudies', played: false, resources: { food: 2 } }), 'B028_ForestryStudies')
    expect(response.state.players[0]!.minorPlayed).toContain('B028_ForestryStudies')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B028 S2: Forest may return two wood to play one occupation for free', () => {
    const session = setup({ cardId: 'B028_ForestryStudies', playerCount: 4 })
    const state = session.getState().state
    state.players[0]!.occupationHand = ['A116_WoodCutter']
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)
    let response = acceptTrigger(session, session.takeAction(0, 'forest'), 'B028_ForestryStudies')
    if (response.state.players[0]!.occupationHand.includes('A116_WoodCutter')
      && response.interaction.stateId === 'wait') {
      const card = options(response).find((option) => option.value === 'A116_WoodCutter')
      expect(card).toBeDefined()
      response = session.resolveChoice(0, card!.value)
    }
    expect(response.state.players[0]!.occupationPlayed).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('B028 S3: the Forestry Studies exchange may be declined', () => {
    const session = setup({ cardId: 'B028_ForestryStudies', playerCount: 4 })
    const state = session.getState().state
    state.players[0]!.occupationHand = ['A116_WoodCutter']
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)
    let response = resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), 'B028_ForestryStudies')
    if (response.interaction.stateId === 'wait') response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.occupationHand).toContain('A116_WoodCutter')
    expect(response.state.players[0]!.resources.wood).toBe(3)
  })

  it('B028 S4: using another wood accumulation space does not trigger Forestry Studies', () => {
    const session = setup({ cardId: 'B028_ForestryStudies', playerCount: 4 })
    const state = session.getState().state
    state.players[0]!.occupationHand = ['A116_WoodCutter']
    state.actionSpaces.find((space) => space.id === 'grove')!.resources.wood = 3
    session.loadState(state)
    const response = session.takeAction(0, 'grove')
    expect(response.state.players[0]!.occupationHand).toContain('A116_WoodCutter')
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'B028_ForestryStudies').toBe(true)
  })
})

const animalPasture = (id: string, type: 'sheep' | 'boar' | 'cattle', count: number) => ({
  id, size: Math.max(1, Math.ceil(count / 2)),
  tiles: Array.from({ length: Math.max(1, Math.ceil(count / 2)) }, (_, col) => ({ row: 0, col })),
  stables: 1, animalType: type, animalCount: count,
})

describe('B039 Loom parity', () => {
  it('B039 S1: two occupations and two wood play Loom', () => {
    const response = playMinor(setup({ cardId: 'B039_Loom', played: false, occupations: 2, resources: { wood: 2 } }), 'B039_Loom')
    expect(response.state.players[0]!.minorPlayed).toContain('B039_Loom')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('B039 S2: fewer than two occupations keep Loom unavailable', () => {
    const session = setup({ cardId: 'B039_Loom', played: false, occupations: 1, resources: { wood: 2 } })
    const response = playMinor(session, 'B039_Loom')
    expect(response.state.players[0]!.minorHand).toContain('B039_Loom')
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it.each([
    ['S3', 0, 0], ['S4', 1, 1], ['S5', 4, 2], ['S6', 7, 3],
  ] as const)('B039 %s: %i sheep yield %i food in the harvest field phase', (_scenario, sheep, food) => {
    const session = setup({ cardId: 'B039_Loom', round: 4, resources: { food: 20, sheep } })
    const state = session.getState().state
    if (sheep > 0) state.players[0]!.pastures = [animalPasture('loom', 'sheep', sheep)]
    session.loadState(state)
    const response = endRound(session)
    expect(response.state.players[0]!.resources.food).toBe(16 + food)
  })

  it('B039 S7: scoring gains one bonus point for every three sheep', () => {
    const session = setup({ cardId: 'B039_Loom', resources: { sheep: 6 } })
    const state = session.getState().state
    state.players[0]!.pastures = [animalPasture('loom-score', 'sheep', 6)]
    session.loadState(state)
    const entry = session.getState().scores[0]!.categories
      .find((category) => category.key === 'cardBonusVp')?.entries
      .find((score) => score.type === 'bonus' && score.cardId === 'B039_Loom')
    expect(entry?.score).toBe(2)
  })
})

describe('B050 Butter Churn parity', () => {
  it('B050 S1: at most three occupations and one wood play Butter Churn', () => {
    const response = playMinor(setup({ cardId: 'B050_ButterChurn', played: false, occupations: 3, resources: { wood: 1 } }), 'B050_ButterChurn')
    expect(response.state.players[0]!.minorPlayed).toContain('B050_ButterChurn')
  })

  it('B050 S2: four occupations keep Butter Churn unavailable', () => {
    const response = playMinor(setup({ cardId: 'B050_ButterChurn', played: false, occupations: 4, resources: { wood: 1 } }), 'B050_ButterChurn')
    expect(response.state.players[0]!.minorHand).toContain('B050_ButterChurn')
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('B050 S3: six sheep and four cattle yield four food in the harvest field phase', () => {
    const session = setup({ cardId: 'B050_ButterChurn', round: 4, resources: { food: 20, sheep: 6, cattle: 4 } })
    const state = session.getState().state
    state.players[0]!.pastures = [animalPasture('sheep', 'sheep', 6), animalPasture('cattle', 'cattle', 4)]
    session.loadState(state)
    expect(endRound(session).state.players[0]!.resources.food).toBe(20)
  })

  it('B050 S4: no sheep or cattle grants no Butter Churn food', () => {
    const response = endRound(setup({ cardId: 'B050_ButterChurn', round: 4, resources: { food: 20 } }))
    expect(response.state.players[0]!.resources.food).toBe(16)
  })
})

describe('B051 Digging Spade parity', () => {
  it('B051 S1: in round seven one wood plays Digging Spade', () => {
    const response = playMinor(setup({ cardId: 'B051_DiggingSpade', played: false, round: 7, resources: { wood: 1 } }), 'B051_DiggingSpade')
    expect(response.state.players[0]!.minorPlayed).toContain('B051_DiggingSpade')
  })

  it('B051 S2: before round seven Digging Spade remains unavailable', () => {
    const response = playMinor(setup({ cardId: 'B051_DiggingSpade', played: false, round: 6, resources: { wood: 1 } }), 'B051_DiggingSpade')
    expect(response.state.players[0]!.minorHand).toContain('B051_DiggingSpade')
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('B051 S3: a clay accumulation space gains food equal to pigs on the farm', () => {
    const session = setup({ cardId: 'B051_DiggingSpade', round: 7, resources: { boar: 3 } })
    const state = session.getState().state
    state.players[0]!.pastures = [animalPasture('boars', 'boar', 3)]
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2
    session.loadState(state)
    const response = session.takeAction(0, 'clay-pit')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, food: 3 })
  })

  it('B051 S4: no pigs or a non-clay accumulation grants no Digging Spade food', () => {
    const noPigs = setup({ cardId: 'B051_DiggingSpade', round: 7 }).takeAction(0, 'clay-pit')
    expect(noPigs.state.players[0]!.resources.food).toBe(0)
    const session = setup({ cardId: 'B051_DiggingSpade', round: 7, resources: { boar: 3 } })
    const state = session.getState().state
    state.players[0]!.pastures = [animalPasture('boars', 'boar', 3)]
    session.loadState(state)
    expect(session.takeAction(0, 'forest').state.players[0]!.resources.food).toBe(0)
  })
})

const pasture = (size: number) => ({
  id: 'growing', size, tiles: Array.from({ length: size }, (_, col) => ({ row: 0, col })),
  stables: 0, animalType: null, animalCount: 0,
})

describe('B052 Growing Farm parity', () => {
  it('B052 S1: four pasture spaces in round five allow Growing Farm and gain five food', () => {
    const session = setup({ cardId: 'B052_GrowingFarm', played: false, round: 5, playerCount: 3, resources: { clay: 2, reed: 1 } })
    const state = session.getState().state
    state.players[0]!.pastures = [pasture(4)]
    session.loadState(state)
    const response = playMinor(session, 'B052_GrowingFarm')
    expect(response.state.players[0]!.minorPlayed).toContain('B052_GrowingFarm')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0, food: 5 })
  })

  it('B052 S2: only three pasture spaces in round five keep Growing Farm unavailable', () => {
    const session = setup({ cardId: 'B052_GrowingFarm', played: false, round: 5, playerCount: 3, resources: { clay: 2, reed: 1 } })
    const state = session.getState().state
    state.players[0]!.pastures = [pasture(3)]
    session.loadState(state)
    const response = playMinor(session, 'B052_GrowingFarm')
    expect(response.state.players[0]!.minorHand).toContain('B052_GrowingFarm')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, reed: 1, food: 0 })
  })
})

describe('B053 Sculpture Course parity', () => {
  it('B053 S1: paying one grain plays Sculpture Course', () => {
    const response = playMinor(setup({ cardId: 'B053_SculptureCourse', played: false, resources: { grain: 1 } }), 'B053_SculptureCourse')
    expect(response.state.players[0]!.minorPlayed).toContain('B053_SculptureCourse')
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it.each([
    ['S2', 'wood', 2], ['S3', 'stone', 4],
  ] as const)('B053 %s: at a non-harvest round end one %s may become %i food', (_scenario, resource, food) => {
    const session = setup({ cardId: 'B053_SculptureCourse', round: 5, resources: { [resource]: 1, food: 20 } })
    let response = endRound(session)
    expect(response.interaction.sourceCard).toBe('B053_SculptureCourse')
    if (response.interaction.stateId !== 'wait') return
    const choice = options(response).find((option) => option.value !== '__skip__' && JSON.stringify(option).includes(resource))
      ?? options(response).find((option) => option.value !== '__skip__')
    response = session.resolveChoice(0, choice!.value)
    expect(response.state.players[0]!.resources[resource]).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(20 + food)
  })

  it('B053 S4: the Sculpture Course exchange may be declined', () => {
    const session = setup({ cardId: 'B053_SculptureCourse', round: 5, resources: { wood: 1, food: 20 } })
    let response = endRound(session)
    if (response.interaction.stateId === 'wait') response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 20 })
  })

  it('B053 S5: a harvest round offers no Sculpture Course exchange', () => {
    const response = endRound(setup({ cardId: 'B053_SculptureCourse', round: 4, resources: { wood: 1, food: 20 } }))
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== 'B053_SculptureCourse').toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })
})

const sow = (session: GameSession) => {
  let response = session.takeAction(0, 'grain-utilization')
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    const option = options(response).find((candidate) => candidate.value === 'sow')
    if (option) response = session.resolveChoice(0, option.value)
  }
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') {
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
  }
  return response
}

describe('B054 Tumbrel parity', () => {
  it('B054 S1: paying one wood plays Tumbrel and immediately gains two food', () => {
    const response = playMinor(setup({ cardId: 'B054_Tumbrel', played: false, resources: { wood: 1 } }), 'B054_Tumbrel')
    expect(response.state.players[0]!.minorPlayed).toContain('B054_Tumbrel')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2 })
  })

  it('B054 S2: an unconditional Sow gains one food per stable', () => {
    const session = setup({ cardId: 'B054_Tumbrel', round: 10, resources: { grain: 1 } })
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
    state.players[0]!.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    session.loadState(state)
    const response = sow(session)
    expect(response.state.players[0]!.stableTiles).toHaveLength(2)
    expect(response.state.players[0]!.resources.food, JSON.stringify(response.state.log.slice(-8))).toBe(2)
  })

  it('B054 S3: an unconditional Sow with no stable grants no Tumbrel food', () => {
    const session = setup({ cardId: 'B054_Tumbrel', round: 10, resources: { grain: 1 } })
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]
    session.loadState(state)
    expect(sow(session).state.players[0]!.resources.food).toBe(0)
  })
})
