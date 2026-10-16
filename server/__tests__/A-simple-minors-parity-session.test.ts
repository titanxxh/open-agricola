import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { type GameState, type PlayerState, type Resource, type FutureMeepleResourceMap } from '../../shared/contract/types'

import '../../shared/cards/A/A006_StorageBarn'
import '../../shared/cards/A/A007_GardenersKnife'
import '../../shared/cards/A/A019_Handplow'
import '../../shared/cards/A/A044_PondHut'
import '../../shared/cards/A/A047_Trellises'
import '../../shared/cards/A/A049_NestSite'
import '../../shared/cards/A/A053_Claypipe'
import '../../shared/cards/A/A069_LargeGreenhouse'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot, getChoiceOptions, expectTileFarmSelection, expectFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
type CardId = 'A006_StorageBarn'
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
  const session = sessionEvidence.track(createWorkSession({ seed: 404, options: { playerCount: 2 } }))
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
  const option = getChoiceOptions(response)?.find((candidate) => {
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
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  if (!option) return response
  response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId) => {
  const response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return getChoiceOptions(response)?.some((candidate) => candidate.value === cardId) ?? false
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

const setupNestSiteRoundEnd = (reed: number) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 449, options: { playerCount: 2 } }))
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
  const session = sessionEvidence.track(createWorkSession({ seed: 453, options: { playerCount: 2 } }))
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
  const session = sessionEvidence.track(createWorkSession({ seed: 419, options: { playerCount: 2 } }))
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
const expectFuture = (state: GameState, cardId: CardId, rounds: number[], resources: FutureMeepleResourceMap) => {
  expect(state.futureMeeples.filter((entry) => entry.cardId === cardId)).toEqual(rounds.map((round) => expect.objectContaining({ cardId, round, resources })))
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
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected future field choice')
    const accept = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected plow selection')
    const tile = expectTileFarmSelection(response, 'plow').selectableTiles[0]
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
    if (response.interaction.stateId !== 'wait')
      throw new Error('expected future field choice')
    response = session.resolveChoice(0, response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger' ? '__pass__' : '__skip__')
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
describe("A006 command boundaries", () => {
  const BARN = 'A006_StorageBarn'
  const BASKET = 'A008_FoodBasket'
  const MARKET = 'A009_YoungAnimalMarket'
  const MAJORS = ['Major_Well', 'Major_Joinery', 'Major_Pottery', 'Major_Basket']
  function setup(card: string, { ownMajors = [], opponentMajors = [], occupations = 0, improvements = 0, resources = {}, opponentPrerequisites = false, inHand = true }: {
    ownMajors?: string[]
    opponentMajors?: string[]
    occupations?: number
    improvements?: number
    resources?: Partial<PlayerState['resources']>
    opponentPrerequisites?: boolean
    inHand?: boolean
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (inHand)
          p.minorHand.push(card)
        else
          state.players[1]!.minorHand.push(card)
        p.improvements = ownMajors
        if (card === MARKET && resources.sheep === 1)
          p.minorPlayed = ['A017_ReclamationPlow']
        state.players[1]!.improvements = opponentMajors
        const target = state.players[opponentPrerequisites ? 1 : 0]!
        target.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist'].slice(0, occupations)
        target.minorPlayed = ['A041_VegetableSlicer', 'B010_Caravan'].slice(0, improvements)
        Object.assign(p.resources, resources)
        if (resources.cattle === 1) {
          p.houseAnimals = { '2-0': 'cattle' }
        }
      } }))
    return s
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function options(r: SessionResponse) {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function enter(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    const branch = options(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.ok(options(r).some(o => o.value === card))
    return ok(s.resolveChoice(0, card))
  }
  function passed(r: SessionResponse, card: string) {
    const p = r.state.players[0]!
    assert.equal(p.minorHand.includes(card), false)
    assert.equal(p.minorPlayed.includes(card), false)
    assert.equal(r.state.players[1]!.minorHand.filter(id => id === card).length, 1)
    assert.equal(r.state.roundPhase, 'work')
    assert.deepEqual([r.state.players[1]!.resources.stone, r.state.players[1]!.resources.wood, r.state.players[1]!.resources.clay, r.state.players[1]!.resources.reed, r.state.players[1]!.resources.grain, r.state.players[1]!.resources.vegetable, r.state.players[1]!.resources.sheep, r.state.players[1]!.resources.cattle], [0, 0, 0, 0, 0, 0, 0, 0])
    assert.equal(r.scores?.length, 2)
    const plays = r.state.events.filter(event => 'fromPlayerId' in event && event.cardId === card)
    assert.equal(plays.length, 1)
    const play = plays[0]!
    assert.ok('fromPlayerId' in play)
    assert.equal(play.fromPlayerId, p.id)
    assert.equal(play.toPlayerId, r.state.players[1]!.id)
    const payments = r.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === card)
    const expectedCost = card === BASKET ? { reed: 1 } : card === MARKET ? { sheep: 1 } : {}
    assert.equal(payments.length, Object.keys(expectedCost).length ? 1 : 0)
    if (payments.length) {
      const payment = payments[0]!
      assert.ok(payment.type === 'resource.paid')
      assert.deepEqual(payment.resources, expectedCost)
    }
    const rewards = r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card && event.reason === 'cardEffect')
    const expectedGain = card === BASKET ? { grain: 1, vegetable: 1 } : card === MARKET ? { cattle: 1 } : {
      ...(p.improvements.includes('Major_Well') ? { stone: 1 } : {}),
      ...(p.improvements.includes('Major_Joinery') ? { wood: 1 } : {}),
      ...(p.improvements.includes('Major_Pottery') ? { clay: 1 } : {}),
      ...(p.improvements.includes('Major_Basket') ? { reed: 1 } : {}),
    }
    assert.equal(rewards.length, Object.keys(expectedGain).length ? 1 : 0)
    if (rewards.length) {
      const reward = rewards[0]!
      assert.ok(reward.type === 'resource.moved')
      assert.deepEqual(reward.resources, expectedGain)
      assert.deepEqual(reward.to, { kind: 'player', playerId: p.id })
    }
  }
  function resources(r: SessionResponse) {
    const p = r.state.players[0]!.resources
    return { stone: p.stone, wood: p.wood, clay: p.clay, reed: p.reed, grain: p.grain, vegetable: p.vegetable, sheep: p.sheep, cattle: p.cattle }
  }
  const ZERO = { stone: 0, wood: 0, clay: 0, reed: 0, grain: 0, vegetable: 0, sheep: 0, cattle: 0 }
  function noRepeat(s: GameSession, card: string) { assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); }
  it("all sixteen own major subsets grant only their corresponding resources", () => {
    const expected = [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [1, 1, 0, 0], [0, 0, 1, 0], [1, 0, 1, 0], [0, 1, 1, 0], [1, 1, 1, 0], [0, 0, 0, 1], [1, 0, 0, 1], [0, 1, 0, 1], [1, 1, 0, 1], [0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]]
    for (let mask = 0; mask < 16; mask++) {
      const s = setup(BARN, { ownMajors: MAJORS.filter((_, i) => mask & (1 << i)) })
      assert.deepEqual(resources(s.getState()), ZERO)
      const offer = enter(s)
      assert.deepEqual(resources(offer), ZERO)
      const r = buy(s, offer, BARN)
      passed(r, BARN)
      assert.deepEqual([r.state.players[0]!.resources.stone, r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.reed], expected[mask])
      noRepeat(s, BARN)
    }
  })
  it("opponent named majors and own Fireplace grant no matching resource", () => {
    const s = setup(BARN, { ownMajors: ['Major_Fireplace1'], opponentMajors: MAJORS })
    const r = buy(s, enter(s), BARN)
    passed(r, BARN)
    assert.deepEqual(resources(r), ZERO)
    assert.deepEqual(r.state.players[1]!.resources.wood, 0)
  })
  it("opponent hand purchase is rejected before a legal free retry", () => {
    const s = setup(BARN, { ownMajors: MAJORS, inHand: false })
    const r = enter(s)
    assert.equal(options(r).some(o => o.value === BARN), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, BARN))
    const retry = buy(s, r, 'A054_Credit')
    assert.deepEqual(resources(retry), ZERO)
    assert.equal(retry.state.players[0]!.resources.food, 5)
  })
  it("undo restores resources hand and worker before a single legal retry", () => {
    const s = setup(BARN, { ownMajors: MAJORS })
    const before = undoRuleSnapshot(s.getState())
    passed(buy(s, enter(s), BARN), BARN)
    assertUndoRestored(before, s.undoAction())
    const r = buy(s, enter(s), BARN)
    assert.deepEqual(resources(r), { ...ZERO, stone: 1, wood: 1, clay: 1, reed: 1 })
    passed(r, BARN)
  })
})
describe("A019 command boundaries", () => {
  const RAMMED = 'A016_RammedClay', RECLAMATION = 'A017_ReclamationPlow', HANDPLOW = 'A019_Handplow'
  function setup(card: string, { played = true, round = 5, resources = {}, configure = () => { } }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (played)
          p.minorPlayed = [card]
        else
          p.minorHand.push(card)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function choices(r: SessionResponse): import('../../shared/contract/types').ActionChoiceOption[] {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function enter(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.ok(choices(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    const played = ok(s.resolveChoice(0, card))
    if ([RAMMED, RECLAMATION, HANDPLOW].includes(card)) {
      assert.equal(played.state.players[0]!.minorPlayed.includes(card), true)
      assert.equal(played.state.players[0]!.minorHand.includes(card), false)
      const events = played.state.events.filter(event => event.type === 'card.played' && event.cardId === card)
      assert.equal(events.length, 1)
      const event = events[0]!
      assert.ok(event.type === 'card.played')
      assert.equal(event.actorPlayerId, played.state.players[0]!.id)
      assert.deepEqual(event.payment?.resources ?? {}, card === RAMMED ? {} : { wood: 1 })
      if (card === RAMMED) {
        const gains = played.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === RAMMED && e.reason === 'cardEffect')
        assert.equal(gains.length, 1)
        const gain = gains[0]!
        assert.ok(gain.type === 'resource.moved')
        assert.deepEqual(gain.resources, { clay: 1 })
      }
    }
    return played
  }
  function accept(s: GameSession, r: SessionResponse, actor = 0) {
    const option = choices(r).find(o => !['__skip__', '__done__', '__pass__'].includes(o.value) && o.labelKey !== 'actions.exchange.name' && !('disabled' in o && o.disabled))
    assert.ok(option)
    return ok(s.resolveChoice(actor, option.value))
  }
  function plow(s: GameSession, r: SessionResponse, tile = { row: 1, col: 2 }, expectedFields = 1) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && expectFarmSelection(r).farmType === 'plow')
    const placed = ok(s.commitSelectionChoice(0, { tile }))
    assert.ok(placed.scores)
    const score = placed.scores[0]!.categories.find(category => category.key === 'fields')
    assert.equal(score?.quantity, expectedFields)
    assert.equal(score?.total, expectedFields === 2 ? 1 : -1)
    return placed
  }
  function future(r: SessionResponse) {
    return r.state.futureMeeples.filter(m => m.cardId === HANDPLOW).map(m => ({ round: m.round, resources: m.resources, owner: m.playerId }))
  }
  function due({ existingField = false } = {}) {
    const s = setup(HANDPLOW, { played: false, resources: { wood: 1 }, configure(state) {
        if (existingField)
          state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
      } })
    const played = buy(s, enter(s), HANDPLOW)
    assert.deepEqual(future(played), [{ round: 10, resources: { field: 1 }, owner: played.state.players[0]!.id }])
    const state = s.getState().state
    state.round = 9
    state.players.forEach(p => { p.resources.food = 20; markAllWorkersUsed(state, p); })
    s.loadState(state)
    const r = ok(s.performRoundEnd())
    assert.equal(r.state.round, 10)
    assert.equal(r.state.players[0]!.fields.length, existingField ? 1 : 0)
    return { s, r }
  }
  it("paid real purchases schedule exactly round plus five within the fourteen round boundary", () => {
    for (const [round, target] of [[5, 10], [9, 14], [10, 0]]) {
      const s = setup(HANDPLOW, { played: false, round, resources: { wood: 1 } })
      const r = buy(s, enter(s), HANDPLOW)
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.fields.length, 0)
      assert.deepEqual(future(r), target ? [{ round: target, resources: { field: 1 }, owner: r.state.players[0]!.id }] : [])
      assertRejectedUnchanged(s, () => s.resolveChoice(0, HANDPLOW))
    }
  })
  it("unpaid forged purchase cannot schedule a field before legal retry", () => {
    const s = setup(HANDPLOW, { played: false })
    const offer = enter(s)
    assert.equal(choices(offer).some(o => o.value === HANDPLOW && !('disabled' in o && o.disabled)), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, HANDPLOW))
    const r = buy(s, offer, 'A054_Credit')
    assert.deepEqual(future(r), [])
    assert.equal(r.state.players[0]!.minorHand.includes(HANDPLOW), true)
  })
  it("actual queued due field rejects occupied outboard nonadjacent and wrong actor before one legal plow", () => {
    const { s, r } = due({ existingField: true })
    const entered = accept(s, r)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { tile: { row: 1, col: 2 } }))
    for (const tile of [{ row: 1, col: 0 }, { row: 99, col: 99 }, { row: 2, col: 4 }])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile }))
    const built = plow(s, entered, { row: 1, col: 2 }, 2)
    assert.equal(built.state.players[0]!.fields.length, 2)
    assert.deepEqual(future(built), [])
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 2 } }))
  })
  it("declining due field consumes the token without field or refund", () => {
    const { s, r: dueResponse } = due()
    assert.ok(dueResponse.interaction.stateId === 'wait' && dueResponse.interaction.request.kind === 'select-trigger')
    assert.ok(getChoiceOptions(dueResponse).some(o => o.value === '__pass__' && !('disabled' in o && o.disabled)))
    const r = ok(s.resolveChoice(0, '__pass__'))
    assert.equal(r.state.players[0]!.fields.length, 0)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.deepEqual(future(r), [])
  })
  it("undo restores purchase cost scheduled field card and worker before retry", () => {
    const s = setup(HANDPLOW, { played: false, resources: { wood: 1 } })
    const before = undoRuleSnapshot(s.getState())
    buy(s, enter(s), HANDPLOW)
    assertUndoRestored(before, s.undoAction())
    const r = buy(s, enter(s), HANDPLOW)
    assert.deepEqual(future(r), [{ round: 10, resources: { field: 1 }, owner: r.state.players[0]!.id }])
  })
  it("preparation due flow exposes its actual undo boundary", () => {
    const { s, r } = due()
    const field = plow(s, accept(s, r), { row: 0, col: 1 })
    assert.equal(field.state.players[0]!.fields.length, 1)
    assert.deepEqual(future(field), [])
    assertRejectedUnchanged(s, () => s.undoStep())
  })
  it("actual purchase queue remains inactive in preparation before the due round", () => {
    const s = setup(HANDPLOW, { played: false, resources: { wood: 1 } })
    buy(s, enter(s), HANDPLOW)
    const state = s.getState().state
    state.round = 8
    state.players.forEach(p => { p.resources.food = 20; markAllWorkersUsed(state, p); })
    s.loadState(state)
    const early = ok(s.performRoundEnd())
    assert.equal(early.state.round, 9)
    assert.equal(early.state.players[0]!.fields.length, 0)
    assert.deepEqual(future(early), [{ round: 10, resources: { field: 1 }, owner: early.state.players[0]!.id }])
    assert.equal(early.interaction.stateId, 'idle')
  })
})
