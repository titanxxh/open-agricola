import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D114_SeedTrader'

const CARD_ID = 'D114_SeedTrader'
const ANYTIME_ID = 'D114-seed-trader-anytime'

const setup = ({
  played = true, food = 5, grainOnCard = 2, vegetableOnCard = 2,
} = {}) => {
  const session = new GameSession(6114, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? ['__test_placeholder__'] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = food
  if (played) {
    owner.cardStates[CARD_ID] = {
      counters: { grain: grainOnCard, vegetable: vegetableOnCard },
    }
  }
  session.loadState(state)
  return session
}

const chooseCardIfNeeded = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

const openAnytimeWindow = (session: GameSession) => session.takeAction(0, 'farmland')

const anytimeIds = (response: SessionResponse) =>
  response.interaction.anytimeActions.map((action) => action.id)

describe('D114 Seed Trader parity', () => {
  it('D114 S1: playing Seed Trader places two grain and two vegetables on the card', () => {
    const session = setup({ played: false })

    const response = chooseCardIfNeeded(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters).toMatchObject({
      grain: 2, vegetable: 2,
    })
  })

  it('D114 S2: paying two food at any time buys one grain from Seed Trader', () => {
    const session = setup({ food: 2, vegetableOnCard: 0 })
    const pending = openAnytimeWindow(session)
    expect(anytimeIds(pending)).toContain(ANYTIME_ID)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      resources: { food: 0, grain: 1 },
      cardStates: { [CARD_ID]: { counters: { grain: 1, vegetable: 0 } } },
    })
  })

  it('D114 S3: paying three food at any time buys one vegetable from Seed Trader', () => {
    const session = setup({ food: 3, grainOnCard: 0 })
    const pending = openAnytimeWindow(session)
    expect(anytimeIds(pending)).toContain(ANYTIME_ID)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      resources: { food: 0, vegetable: 1 },
      cardStates: { [CARD_ID]: { counters: { grain: 0, vegetable: 1 } } },
    })
  })

  it('D114 S4: Seed Trader can sell both grain in the same action window', () => {
    const session = setup({ food: 4, vegetableOnCard: 0 })
    openAnytimeWindow(session)

    const first = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(first.ok, first.error).toBe(true)
    const second = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(second.ok, second.error).toBe(true)
    expect(second.state.players[0]).toMatchObject({
      resources: { food: 0, grain: 2 },
      cardStates: { [CARD_ID]: { counters: { grain: 0, vegetable: 0 } } },
    })
    expect(anytimeIds(second)).not.toContain(ANYTIME_ID)
  })

  it('D114 S5: two food cannot buy a remaining vegetable', () => {
    const session = setup({ food: 2, grainOnCard: 0, vegetableOnCard: 1 })
    const pending = openAnytimeWindow(session)

    expect(anytimeIds(pending)).not.toContain(ANYTIME_ID)
    const response = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(response.ok).toBe(false)
    expect(response.state.players[0]).toMatchObject({
      resources: { food: 2, vegetable: 0 },
      cardStates: { [CARD_ID]: { counters: { grain: 0, vegetable: 1 } } },
    })
  })

  it('D114 S6: Seed Trader is unavailable after all four stored crops are gone', () => {
    const session = setup({ food: 10, grainOnCard: 0, vegetableOnCard: 0 })
    const pending = openAnytimeWindow(session)

    expect(anytimeIds(pending)).not.toContain(ANYTIME_ID)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
  })
})
