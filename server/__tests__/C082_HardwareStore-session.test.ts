import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/C/C082_HardwareStore'

const CARD_ID = 'C082_HardwareStore'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({ played = true, food = 0 }: { played?: boolean; food?: number } = {}) => {
  const session = new GameSession(6082, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.wood = played ? 0 : 1
  owner.resources.clay = played ? 0 : 1
  owner.resources.food = food
  session.loadState(state)
  return session
}

const playCard = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const enterHardwareStore = (session: GameSession, response: SessionResponse) =>
  resolveTriggerIfPresent(session, response, CARD_ID)

describe('C082 Hardware Store parity', () => {
  it('C082 S1: paying one wood and one clay plays Hardware Store for one printed point', () => {
    const response = playCard(setup({ played: false }))
    const printed = response.scores[0]!.categories.find((category) => category.key === 'cards')
      ?.entries.find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
    expect(printed).toBe(1)
  })

  it('C082 S2: Day Laborer food can immediately buy all four building resources', () => {
    const session = setup()
    let response = enterHardwareStore(session, session.takeAction(0, 'day-laborer'))
    response = resolveNonSkipChoice(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, wood: 1, clay: 1, reed: 1, stone: 1,
    })
  })

  it('C082 S3: declining Hardware Store keeps both Day Laborer food', () => {
    const session = setup()
    let response = enterHardwareStore(session, session.takeAction(0, 'day-laborer'))
    response = resolveSkipChoice(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })

  it('C082 S4: a non-Day-Laborer action does not offer Hardware Store', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      grain: 1, wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })
})
