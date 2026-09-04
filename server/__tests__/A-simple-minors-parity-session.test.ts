import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'

import '../../shared/cards/A/A006_StorageBarn'
import '../../shared/cards/A/A007_GardenersKnife'
import '../../shared/cards/A/A019_Handplow'
import '../../shared/cards/A/A044_PondHut'
import '../../shared/cards/A/A047_Trellises'
import '../../shared/cards/A/A049_NestSite'
import '../../shared/cards/A/A053_Claypipe'
import '../../shared/cards/A/A069_LargeGreenhouse'

type CardId =
  | 'A006_StorageBarn'
  | 'A007_GardenersKnife'
  | 'A019_Handplow'
  | 'A044_PondHut'
  | 'A047_Trellises'
  | 'A049_NestSite'
  | 'A053_Claypipe'
  | 'A069_LargeGreenhouse'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']

const setupMinor = ({
  cardId,
  resources = {},
  occupations = 0,
  majors = [],
  round = 5,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  occupations?: number
  majors?: string[]
  round?: number
}) => {
  const session = new GameSession(404, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [cardId]
  player.occupationHand = [FILLER]
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.improvements = [...majors]
  player.resources = {
    ...player.resources,
    food: 0,
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    grain: 0,
    vegetable: 0,
    ...resources,
  }
  const opponent = state.players[1]!
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  setWorkersAtHome(state, opponent, 2)
  const improvement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!improvement) throw new Error('major-improvement missing')
  improvement.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.value.startsWith('action-improvement-')
  })
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId): SessionResponse => {
  let response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  if (!option) return response
  response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId) => {
  const response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

const setupNestSiteRoundEnd = (reed: number) => {
  const session = new GameSession(449, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorPlayed.push('A049_NestSite')
  player.resources.food = 0
  const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')
  if (!reedBank) throw new Error('reed-bank missing')
  reedBank.resources.reed = reed
  session.loadState(state)
  return session
}

const setupClaypipeRoundEnd = (buildingResources: number) => {
  const session = new GameSession(453, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorPlayed.push('A053_Claypipe')
  player.resources.food = 0
  player.cardStates.A053_Claypipe = { infobox: `${buildingResources} / 7` }
  state.workPhaseObtainedResources[player.id] = { clay: buildingResources }
  session.loadState(state)
  return session
}

const performRoundEndForFutureResources = (session: GameSession, beforeRound: number) => {
  const state = session.getState().state
  state.round = beforeRound
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  session.loadState(state)
  return session.performRoundEnd()
}

const dueHandplowField = () => {
  const session = new GameSession(419, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 9
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const player = state.players[0]!
  state.futureMeeples = [{
    id: 'A019-due-field',
    cardId: 'A019_Handplow',
    playerId: player.id,
    round: 10,
    actionId: null,
    resources: { field: 1 },
  }]
  session.loadState(state)
  return session
}

const expectFuture = (
  state: GameState,
  cardId: CardId,
  rounds: number[],
  resources: Partial<Resource>,
) => {
  expect(state.futureMeeples.filter((entry) => entry.cardId === cardId)).toEqual(
    rounds.map((round) => expect.objectContaining({ cardId, round, resources })),
  )
}

describe('A006 Storage Barn parity', () => {
  it('A006 S1: all four named major improvements grant their matching building resources and Storage Barn passes', () => {
    const response = playMinor(setupMinor({
      cardId: 'A006_StorageBarn',
      majors: ['Major_Well', 'Major_Joinery', 'Major_Pottery', 'Major_Basket'],
    }), 'A006_StorageBarn')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, wood: 1, clay: 1, reed: 1 })
    expect(response.state.players[1]!.minorHand).toContain('A006_StorageBarn')
  })

  it('A006 S2: no named major improvement grants nothing and Storage Barn still passes', () => {
    const response = playMinor(setupMinor({ cardId: 'A006_StorageBarn' }), 'A006_StorageBarn')

    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 0, clay: 0, reed: 0 })
    expect(response.state.players[1]!.minorHand).toContain('A006_StorageBarn')
  })
})

describe('A007 Gardeners Knife parity', () => {
  it('A007 S1: two grain fields and one vegetable field grant two food and one grain after paying one wood', () => {
    const session = setupMinor({ cardId: 'A007_GardenersKnife', resources: { wood: 1 } })
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 1, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 1, col: 3, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    session.loadState(session.state)

    const response = playMinor(session, 'A007_GardenersKnife')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2, grain: 1 })
    expect(response.state.players[1]!.minorHand).toContain('A007_GardenersKnife')
  })

  it('A007 S2: no planted fields grant no crop reward and Gardeners Knife still passes', () => {
    const response = playMinor(setupMinor({
      cardId: 'A007_GardenersKnife',
      resources: { wood: 1 },
    }), 'A007_GardenersKnife')

    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0 })
    expect(response.state.players[1]!.minorHand).toContain('A007_GardenersKnife')
  })
})

describe('A019 Handplow parity', () => {
  it('A019 S1: playing Handplow in round 5 schedules one field for round 10', () => {
    const response = playMinor(setupMinor({
      cardId: 'A019_Handplow', resources: { wood: 1 }, round: 5,
    }), 'A019_Handplow')

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expectFuture(response.state, 'A019_Handplow', [10], { field: 1 })
  })

  it('A019 S2: playing Handplow in round 9 schedules one field for round 14', () => {
    const response = playMinor(setupMinor({
      cardId: 'A019_Handplow', resources: { wood: 1 }, round: 9,
    }), 'A019_Handplow')

    expectFuture(response.state, 'A019_Handplow', [14], { field: 1 })
  })

  it('A019 S3: a Handplow target after round 14 schedules no future field', () => {
    const response = playMinor(setupMinor({
      cardId: 'A019_Handplow', resources: { wood: 1 }, round: 12,
    }), 'A019_Handplow')

    expect(response.state.players[0]!.minorPlayed).toContain('A019_Handplow')
    expectFuture(response.state, 'A019_Handplow', [], { field: 1 })
  })

  it('A019 S4: accepting the due Handplow field allows one free plow and consumes the token', () => {
    const session = dueHandplowField()
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected future field choice')
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected plow selection')
    const tile = response.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    response = session.commitSelectionChoice(0, { tile })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'A019_Handplow')).toEqual([])
  })

  it('A019 S5: declining the due Handplow field consumes the token without plowing', () => {
    const session = dueHandplowField()
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected future field choice')

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'A019_Handplow')).toEqual([])
  })
})

describe('A044 Pond Hut parity', () => {
  it('A044 S1: exactly two occupations schedule Pond Hut food for the next three rounds', () => {
    const response = playMinor(setupMinor({
      cardId: 'A044_PondHut', resources: { wood: 1 }, occupations: 2, round: 5,
    }), 'A044_PondHut')

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expectFuture(response.state, 'A044_PondHut', [6, 7, 8], { food: 1 })
  })

  it('A044 S2: three occupations keep exact-two Pond Hut unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'A044_PondHut', resources: { wood: 1 }, occupations: 3,
    }), 'A044_PondHut')).toBe(false)
  })

  it('A044 S3: one occupation keeps exact-two Pond Hut unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'A044_PondHut', resources: { wood: 1 }, occupations: 1,
    }), 'A044_PondHut')).toBe(false)
  })

  it('A044 S4: Pond Hut schedules only round 14 when played in round 13', () => {
    const response = playMinor(setupMinor({
      cardId: 'A044_PondHut', resources: { wood: 1 }, occupations: 2, round: 13,
    }), 'A044_PondHut')

    expectFuture(response.state, 'A044_PondHut', [14], { food: 1 })
  })

  it('A044 S5: Pond Hut schedules no food when no later round space exists', () => {
    const response = playMinor(setupMinor({
      cardId: 'A044_PondHut', resources: { wood: 1 }, occupations: 2, round: 14,
    }), 'A044_PondHut')

    expect(response.state.players[0]!.minorPlayed).toContain('A044_PondHut')
    expectFuture(response.state, 'A044_PondHut', [], { food: 1 })
  })

  it('A044 S6: due Pond Hut food is received at the start of the next round', () => {
    const session = setupMinor({
      cardId: 'A044_PondHut', resources: { wood: 1 }, occupations: 2, round: 5,
    })
    playMinor(session, 'A044_PondHut')

    const response = performRoundEndForFutureResources(session, 5)

    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response.state, 'A044_PondHut', 'food')).toEqual([7, 8])
  })
})

describe('A047 Trellises parity', () => {
  const setFences = (player: PlayerState, count: number) => {
    player.fenceSegments = Array.from({ length: count }, (_, index) => ({
      edge: `test-fence-${index}`,
      type: 'fence' as const,
    }))
  }

  it('A047 S1: three built fences schedule Trellises food for the next three rounds', () => {
    const session = setupMinor({ cardId: 'A047_Trellises', resources: { wood: 1 }, round: 5 })
    setFences(session.state.players[0]!, 3)
    session.loadState(session.state)

    const response = playMinor(session, 'A047_Trellises')

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expectFuture(response.state, 'A047_Trellises', [6, 7, 8], { food: 1 })
  })

  it('A047 S2: no built fences schedule no food', () => {
    const response = playMinor(setupMinor({
      cardId: 'A047_Trellises', resources: { wood: 1 },
    }), 'A047_Trellises')

    expect(response.state.players[0]!.minorPlayed).toContain('A047_Trellises')
    expect(futureRounds(response.state, 'A047_Trellises', 'food')).toEqual([])
  })

  it('A047 S3: late Trellises drops fence-counted food after round 14', () => {
    const session = setupMinor({ cardId: 'A047_Trellises', resources: { wood: 1 }, round: 13 })
    setFences(session.state.players[0]!, 3)
    session.loadState(session.state)

    const response = playMinor(session, 'A047_Trellises')

    expectFuture(response.state, 'A047_Trellises', [14], { food: 1 })
  })

  it('A047 S4: Trellises schedules no food when no later round space exists', () => {
    const session = setupMinor({ cardId: 'A047_Trellises', resources: { wood: 1 }, round: 14 })
    setFences(session.state.players[0]!, 3)
    session.loadState(session.state)

    const response = playMinor(session, 'A047_Trellises')

    expect(response.state.players[0]!.minorPlayed).toContain('A047_Trellises')
    expectFuture(response.state, 'A047_Trellises', [], { food: 1 })
  })

  it('A047 S5: due Trellises food is received at the start of the next round', () => {
    const session = setupMinor({ cardId: 'A047_Trellises', resources: { wood: 1 }, round: 5 })
    setFences(session.state.players[0]!, 2)
    session.loadState(session.state)
    playMinor(session, 'A047_Trellises')

    const response = performRoundEndForFutureResources(session, 5)

    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response.state, 'A047_Trellises', 'food')).toEqual([7])
  })
})

describe('A049 Nest Site parity', () => {
  it('A049 S1: one occupation lets Nest Site cost one food and remain in play', () => {
    const response = playMinor(setupMinor({
      cardId: 'A049_NestSite', resources: { food: 1 }, occupations: 1,
    }), 'A049_NestSite')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain('A049_NestSite')
  })

  it('A049 S2: a nonempty Reed Bank before preparation grants one food when another reed accumulates', () => {
    const response = setupNestSiteRoundEnd(1).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(2)
  })

  it('A049 S3: an empty Reed Bank before preparation grants no food when its first reed accumulates', () => {
    const response = setupNestSiteRoundEnd(0).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed).toBe(1)
  })

  it('A049 S4: no occupation keeps Nest Site unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'A049_NestSite', resources: { food: 1 },
    }), 'A049_NestSite')).toBe(false)
  })
})

describe('A053 Claypipe parity', () => {
  it('A053 S1: Claypipe costs one clay and initializes its counter when played', () => {
    const response = playMinor(setupMinor({
      cardId: 'A053_Claypipe', resources: { clay: 1 },
    }), 'A053_Claypipe')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain('A053_Claypipe')
    expect(response.state.players[0]!.cardStates.A053_Claypipe?.infobox).toBe('0 / 7')
  })

  it('A053 S2: seven building resources in the work phase grant two food at return home and reset the counter', () => {
    const response = setupClaypipeRoundEnd(7).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.cardStates.A053_Claypipe?.infobox).toBe('0 / 7')
  })

  it('A053 S3: six building resources grant no food at return home and still reset the counter', () => {
    const response = setupClaypipeRoundEnd(6).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates.A053_Claypipe?.infobox).toBe('0 / 7')
  })
})

describe('A069 Large Greenhouse parity', () => {
  it('A069 S1: two occupations schedule vegetables four, seven, and nine rounds later', () => {
    const response = playMinor(setupMinor({
      cardId: 'A069_LargeGreenhouse', resources: { wood: 2 }, occupations: 2, round: 5,
    }), 'A069_LargeGreenhouse')

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expectFuture(response.state, 'A069_LargeGreenhouse', [9, 12, 14], { vegetable: 1 })
  })

  it('A069 S2: one occupation keeps Large Greenhouse unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'A069_LargeGreenhouse', resources: { wood: 2 }, occupations: 1,
    }), 'A069_LargeGreenhouse')).toBe(false)
  })

  it('A069 S3: Large Greenhouse keeps only its round-12 vegetable when played in round 8', () => {
    const response = playMinor(setupMinor({
      cardId: 'A069_LargeGreenhouse', resources: { wood: 2 }, occupations: 2, round: 8,
    }), 'A069_LargeGreenhouse')

    expectFuture(response.state, 'A069_LargeGreenhouse', [12], { vegetable: 1 })
  })

  it('A069 S4: Large Greenhouse schedules no vegetables when every offset is after round 14', () => {
    const response = playMinor(setupMinor({
      cardId: 'A069_LargeGreenhouse', resources: { wood: 2 }, occupations: 2, round: 11,
    }), 'A069_LargeGreenhouse')

    expect(response.state.players[0]!.minorPlayed).toContain('A069_LargeGreenhouse')
    expect(futureRounds(response.state, 'A069_LargeGreenhouse', 'vegetable')).toEqual([])
  })

  it('A069 S5: due Large Greenhouse vegetable is received at the start of its round', () => {
    const session = setupMinor({
      cardId: 'A069_LargeGreenhouse', resources: { wood: 2 }, occupations: 2, round: 5,
    })
    playMinor(session, 'A069_LargeGreenhouse')

    const response = performRoundEndForFutureResources(session, 8)

    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(futureRounds(response.state, 'A069_LargeGreenhouse', 'vegetable')).toEqual([12, 14])
  })
})
