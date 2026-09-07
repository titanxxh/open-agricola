import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

import '../../shared/cards/E/E084_DollysMother'
import '../../shared/cards/A/A084_Silage'

const CARD_ID = 'E084_DollysMother'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, sheep = 1, boar = 0, cattle = 0, pasture = false, round = 5,
}: {
  played?: boolean
  sheep?: number
  boar?: number
  cattle?: number
  pasture?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(7084, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: index === 0 ? sheep : 0,
      boar: index === 0 ? boar : 0,
      cattle: index === 0 ? cattle : 0,
      begging: 0,
    }
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  player.minorPlayed = played ? [CARD_ID] : []
  if (pasture) {
    const animalType = sheep > 0 ? 'sheep' : boar > 0 ? 'boar' : cattle > 0 ? 'cattle' : null
    const animalCount = sheep + boar + cattle
    player.pastures = [{
      id: 'dolly-pasture',
      size: 1,
      tiles: [{ row: 0, col: 1 }],
      stables: 1,
      animalType,
      animalCount,
    }]
  } else if (sheep + boar + cattle === 1) {
    const animalType = sheep > 0 ? 'sheep' : boar > 0 ? 'boar' : 'cattle'
    player.houseAnimalType = animalType
    player.houseAnimalCount = 1
  }
  const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
  if (sheepMarket) sheepMarket.resources.sheep = 1
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const finishRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return autoAdvanceRoundEnd(session)
}

describe("E084 Dolly's Mother parity", () => {
  it("E084 S1: one sheep allows Dolly's Mother to be played for no resources", () => {
    const session = setup()
    const food = session.state.players[0]!.resources.food

    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(food)
  })

  it("E084 S2: without a sheep Dolly's Mother is unavailable", () => {
    const response = enterMinor(setup({ sheep: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it("E084 S3: Dolly's Mother holds one sheep beside an occupied house", () => {
    const session = setup({ played: true, sheep: 0, boar: 1, round: 14 })

    const pending = session.takeAction(0, 'sheep-market')

    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'animal-reorg') return
    const cardZone = pending.interaction.request.zones.find((zone) => zone.id === `card:${CARD_ID}`)
    expect(cardZone).toMatchObject({ capacity: 1, allowedAnimalType: 'sheep' })
    const house = pending.interaction.request.zones.find((zone) => zone.id === 'house')
    expect(house).toBeDefined()
    const response = session.resolveChoice(0, 'confirm', {
      zones: [
        { ...house!, animalType: 'boar', animalCount: 1 },
        { ...cardZone!, animalType: 'sheep', animalCount: 1 },
      ],
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts).toEqual({ sheep: 1 })
  })

  it("E084 S4: one sheep breeds one newborn during a harvest", () => {
    const response = finishRound(setup({ played: true, pasture: true, round: 4 }))

    expect(response.state.players[0]!.resources.sheep).toBe(2)
  })

  it("E084 S5: without Dolly's Mother one sheep does not breed during a harvest", () => {
    const session = setup({ played: true, pasture: true, round: 4 })
    session.state.players[0]!.minorPlayed = []
    session.loadState(session.state)

    const response = finishRound(session)

    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })

  it("E084 S6: Dolly's Mother does not lower the breeding threshold for boar or cattle", () => {
    for (const type of ['boar', 'cattle'] as const) {
      const response = finishRound(setup({
        played: true, sheep: 0, [type]: 1, pasture: true, round: 4,
      }))

      expect(response.state.players[0]!.resources[type], type).toBe(1)
    }
  })

  it("E084 S7: OA does not let non-harvest Silage breed from one sheep", () => {
    const session = setup({ played: true, pasture: true, round: 5 })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('A084_Silage')
    player.resources.grain = 1
    player.fields = [
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
    ]
    state.players.forEach((entry) => markAllWorkersUsed(state, entry))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.interaction.stateId === 'wait'
      ? JSON.stringify(response.interaction.request).includes('A084_Silage')
      : false).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: 1 })
  })

  it("E084 S8: Dolly's Mother contributes its printed one point at scoring", () => {
    const response = setup({ played: true }).getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })
})
