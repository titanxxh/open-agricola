import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { AnytimeAction } from '../../shared/contract/types'
import '../../shared/cards/B/B069_PottersMarket'

const CARD_ID = 'B069_PottersMarket'

const ANYTIME_ID = 'B69-potters-market-anytime'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, round = 5, clay = 0, food = 0, wood = 0 } = {}) => {
  const session = new GameSession(6069, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.futureMeeples = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources = {
    ...owner.resources,
    wood, clay, reed: 0, stone: 0, food, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, begging: 0,
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const enterActiveInteraction = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const anytimeIds = (response: SessionResponse) =>
  response.interaction.anytimeActions.map((action: AnytimeAction) => action.id)

const pendingVegetables = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.pending ?? 0

describe("B069 Potter's Market parity", () => {
  it("B069 S1: paying two wood plays Potter's Market for one point", () => {
    const response = playMinor(setup({ played: false, wood: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    const entry = response.scores?.[0]?.categories.find((category) => category.key === 'cards')
      ?.entries.find((candidate) => 'cardId' in candidate && candidate.cardId === CARD_ID)
    expect(entry?.score).toBe(1)
  })

  it('B069 S2: paying three clay and two food at any time schedules one vegetable for each of the next two rounds', () => {
    const session = setup({ clay: 3, food: 2 })
    const active = enterActiveInteraction(session)
    expect(anytimeIds(active)).toContain(ANYTIME_ID)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0, vegetable: 0 })
    expect(pendingVegetables(response)).toBe(2)
  })

  it("B069 S3: Potter's Market is unavailable when either clay or food is insufficient", () => {
    for (const resources of [{ clay: 2, food: 2 }, { clay: 3, food: 1 }]) {
      const response = enterActiveInteraction(setup(resources))

      expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
      expect(pendingVegetables(response)).toBe(0)
    }
  })

  it("B069 S4: the first Potter's Market vegetable is received at the start of the next round", () => {
    const session = setup({ clay: 3, food: 22 })
    enterActiveInteraction(session)
    const scheduled = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(scheduled.ok, scheduled.error).toBe(true)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(pendingVegetables(response)).toBe(1)
  })

  it("B069 S5: OA hides Potter's Market in round fourteen and preserves the payment resources", () => {
    const response = enterActiveInteraction(setup({ round: 14, clay: 3, food: 2 }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, food: 2, vegetable: 0 })
    expect(pendingVegetables(response)).toBe(0)
  })
})
