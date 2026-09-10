import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E109_BraidMaker'
import '../../shared/cards/A/A143_Stonecutter'

const CARD_ID = 'E109_BraidMaker'
const BASKET = 'Major_Basket'
const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, harvest = false, reed = 2, stone = 2, food = 0, stonecutter = false, round,
}: {
  played?: boolean
  harvest?: boolean
  reed?: number
  stone?: number
  food?: number
  stonecutter?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(6109, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round ?? (harvest ? 4 : 3)
  state.roundPhase = 'work'
  state.availableMajorImprovements = [BASKET]
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, harvest ? 0 : (index === 0 ? 2 : 0))
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    if (harvest) {
      setActiveWorkerCount(player, 2)
      markAllWorkersUsed(state, player)
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.minorHand = ['B007_Wage']
  if (stonecutter) owner.occupationPlayed.push('A143_Stonecutter')
  Object.assign(owner.resources, { reed, stone, food })
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationPlayed.includes(CARD_ID)) return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const buildBasket = (session: GameSession, actionId: 'meeting-place' | 'major-improvement') => {
  let response = session.takeAction(0, actionId)
  for (let guard = 0; guard < 6 && response.interaction.stateId === 'wait'; guard += 1) {
    if (response.state.players[0]!.improvements.includes(BASKET)) break
    if (response.interaction.promptKey === 'prompt.selectPayment') {
      const payment = options(response).find((option) => option.value !== 'cancel')
      expect(payment, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
      continue
    }
    const basket = options(response).find((option) => option.value === BASKET)
    if (basket) {
      response = session.resolveChoice(response.interaction.playerIndex, basket.value)
      continue
    }
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (!improvement) break
    response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  return response
}

describe('E109 Braid Maker parity', () => {
  it('E109 S1: Braid Maker is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false, reed: 0, stone: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('E109 S2: a Minor Improvement action builds Basket at the fixed price', () => {
    const response = buildBasket(setup(), 'meeting-place')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1 })
  })

  it('E109 S3: without Braid Maker a Minor Improvement action does not offer Basket', () => {
    const session = setup({ played: false })
    let response = session.takeAction(0, 'meeting-place')
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    expect(improvement, JSON.stringify(response.interaction)).toBeDefined()
    if (improvement) {
      response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }

    expect(options(response).map((option) => option.value)).not.toContain(BASKET)
  })

  it('E109 S4: a normal Major Improvement action uses the fixed Basket price', () => {
    const response = buildBasket(setup({ round: 14 }), 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1 })
  })

  it('E109 S5: Stonecutter further reduces the fixed Basket price by one stone', () => {
    const response = buildBasket(setup({ stonecutter: true, round: 14 }), 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(BASKET)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 2 })
  })

  it('E109 S6: during harvest one reed may become two food before feeding', () => {
    const session = setup({ harvest: true, reed: 1, stone: 0, food: 2 })
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, request: { kind: 'feed' },
    })
    response = session.resolveChoice(0, 'confirm', {
      selections: [{ sourceId: CARD_ID, exchangeIndex: 0, count: 1, sourceName: 'Braid Maker' }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, food: 0, begging: 0 })
  })

  it('does not offer the reed exchange outside harvest', () => {
    const session = setup({ reed: 1, stone: 0 })
    const response = session.takeAction(0, 'farmland')
    expect(response.interaction.anytimeActions.map((action) => action.id)).not.toContain('exchange')
    expect(session.takeAnytimeAction(0, 'exchange').ok).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, food: 0 })
  })
})
