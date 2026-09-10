import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A090_PlowDriver'
import '../../shared/cards/A/A091_ShiftingCultivator'
import '../../shared/cards/A/A101_CookeryOutfitter'
import '../../shared/cards/A/A133_Braggart'

const FILLER = '__test_placeholder__'
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  cardId, played = true, playerCount = 2, round = 5, resources = {},
}: {
  cardId: string
  played?: boolean
  playerCount?: number
  round?: number
  resources?: Record<string, number>
}) => {
  const session = new GameSession(7090 + round, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
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
  if (response.interaction.stateId === 'wait' && response.state.players[0]!.occupationHand.includes(cardId)) {
    const card = options(response).find((option) => option.value === cardId)
    expect(card).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const bonusScore = (response: SessionResponse, cardId: string) => response.scores[0]!.categories
  .find((category) => category.key === 'cardBonusVp')?.entries
  .find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

const commitPlow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(
    response.interaction.playerIndex, { tile: response.interaction.request.farm.selectableTiles[0]! },
  )
}

describe('A090 Plow Driver parity', () => {
  const CARD_ID = 'A090_PlowDriver'

  it('A090 S1: Plow Driver is played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  const startRound = (houseType: 'wood' | 'clay' | 'stone', food: number) => {
    const session = setup({ cardId: CARD_ID, resources: { food } })
    const state = session.getState().state
    state.players[0]!.houseType = houseType
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    state.players.forEach((player) => { player.resources.food = player === state.players[0] ? food : 20 })
    session.loadState(state)
    return { session, response: session.performRoundEnd() }
  }

  it('A090 S2: at round start a stone-house owner may pay one food to plow one field', () => {
    const { session } = startRound('stone', 1)
    let response = session.getState()
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    response = commitPlow(session, response)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toHaveLength(1)
  })

  it('A090 S3: the Plow Driver round-start plow may be declined', () => {
    const { session, response: initial } = startRound('stone', 1)
    const response = session.resolveChoice(initial.interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })

  it('A090 S4: a non-stone house receives no Plow Driver offer', () => {
    const { response } = startRound('clay', 1)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('A090 S5: a stone-house owner without food receives no Plow Driver offer in OA', () => {
    const { response } = startRound('stone', 0)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })
})

describe('A091 Shifting Cultivator parity', () => {
  const CARD_ID = 'A091_ShiftingCultivator'

  it('A091 S1: Shifting Cultivator is played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  const collect = (food: number, spaceId = 'forest') => {
    const session = setup({ cardId: CARD_ID, resources: { food } })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(state)
    return { session, response: session.takeAction(0, spaceId) }
  }

  it('A091 S2: before collecting Forest wood, three food may buy one plow', () => {
    const { session, response: initial } = collect(3)
    let response = resolveTriggerIfPresent(session, initial, CARD_ID)
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    response = commitPlow(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3 })
    expect(response.state.players[0]!.fields).toHaveLength(1)
  })

  it('A091 S3: declining Shifting Cultivator preserves food and still collects wood', () => {
    const { session, response: initial } = collect(3)
    let response = resolveTriggerIfPresent(session, initial, CARD_ID)
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, wood: 3 })
  })

  it('A091 S4: fewer than three food silently skips Shifting Cultivator in OA', () => {
    const { response } = collect(2)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 3 })
  })

  it('A091 S5: a non-wood accumulation offers no Shifting Cultivator plow', () => {
    const { response } = collect(3, 'clay-pit')
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(3)
  })
})

describe('A101 Cookery Outfitter parity', () => {
  const CARD_ID = 'A101_CookeryOutfitter'

  it('A101 S1: Cookery Outfitter is played as the first occupation', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A101 S2: cooking improvements score while ovens do not', () => {
    const session = setup({ cardId: CARD_ID, round: 14 })
    const state = session.getState().state
    state.players[0]!.improvements = [
      'Major_Fireplace1', 'Major_CookingHearth1', 'Major_ClayOven', 'Major_StoneOven',
    ]
    session.loadState(state)
    expect(bonusScore(session.getState(), CARD_ID)).toBe(2)
  })
})

describe('A133 Braggart parity', () => {
  const CARD_ID = 'A133_Braggart'
  const improvements = [
    'Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2',
    'Major_ClayOven', 'Major_StoneOven', 'Major_Joinery', 'Major_Pottery', 'Major_Basket', 'Major_Well',
  ]

  it('A133 S1: Braggart is played as the first occupation in a three-player game', () => {
    expect(playOccupation(setup({ cardId: CARD_ID, played: false, playerCount: 3 }), CARD_ID)
      .state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A133 S2: Braggart scores the printed improvement-count thresholds', () => {
    for (const [count, expected] of [[4, 0], [5, 2], [6, 3], [7, 4], [8, 5], [9, 7], [10, 9]]) {
      const session = setup({ cardId: CARD_ID, playerCount: 3, round: 14 })
      const state = session.getState().state
      state.players[0]!.improvements = improvements.slice(0, count)
      session.loadState(state)
      expect(bonusScore(session.getState(), CARD_ID), `count=${count}`).toBe(expected)
    }
  })
})
