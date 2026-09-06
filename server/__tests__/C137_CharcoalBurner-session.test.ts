import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C137_CharcoalBurner'
import '../../shared/cards/D/D064_BakingCourse'

const CARD_ID = 'C137_CharcoalBurner'
const BAKING_MINOR_ID = 'D064_BakingCourse'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true,
  owner = 0,
  actor = 0,
  improvement = null as string | null,
} = {}) => {
  const session = new GameSession(5137, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = improvement?.startsWith('Major_') ? [improvement] : []

  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: index === actor ? 1 : 0,
      clay: index === actor ? 2 : 0,
      reed: 0,
      stone: index === actor ? 3 : 0,
      food: 0,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    }
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
  })

  const cardOwner = state.players[owner]!
  cardOwner.occupationHand = played ? [FILLER] : [CARD_ID, FILLER]
  cardOwner.occupationPlayed = played ? [CARD_ID] : []

  const actingPlayer = state.players[actor]!
  if (actor !== owner) actingPlayer.occupationPlayed = [FILLER]
  if (improvement === BAKING_MINOR_ID) actingPlayer.minorHand = [BAKING_MINOR_ID, FILLER]

  session.loadState(state)
  return session
}

const playCharcoalBurner = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  return response
}

const resolveCharcoalBurnerTrigger = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'select-trigger') return response
  const option = response.interaction.request.options?.find((entry) =>
    entry.value === CARD_ID || entry.sourceCard === CARD_ID)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return option
    ? session.resolveChoice(response.interaction.playerIndex, option.value)
    : response
}

const buildImprovement = (session: GameSession, actor: number, cardId: string) => {
  let response = session.takeAction(actor, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  const hasBuiltCard = () => response.state.players[actor]!.improvements.includes(cardId)
    || response.state.players[actor]!.minorPlayed.includes(cardId)

  if (hasBuiltCard()) return resolveCharcoalBurnerTrigger(session, response)

  if (response.interaction.stateId === 'wait'
    && !response.interaction.request.options?.some((entry) => entry.value === cardId)) {
    const branch = response.interaction.request.options?.find((entry) =>
      entry.value.startsWith('action-improvement-'))
    expect(branch, JSON.stringify(response.interaction)).toBeDefined()
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }

  if (hasBuiltCard()) return resolveCharcoalBurnerTrigger(session, response)

  if (response.interaction.stateId === 'wait') {
    const card = response.interaction.request.options?.find((entry) => entry.value === cardId)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }

  return resolveCharcoalBurnerTrigger(session, response)
}

describe('C137 Charcoal Burner parity', () => {
  it('C137 S1: Charcoal Burner can be played as the first occupation in a three-player game', () => {
    const response = playCharcoalBurner(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })

  it('C137 S2: the owner building a Fireplace gains one wood and one food', () => {
    const response = buildImprovement(setup({ improvement: 'Major_Fireplace1' }), 0, 'Major_Fireplace1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 0, food: 1 })
  })

  it('C137 S3: another player building a Fireplace rewards only the owner', () => {
    const response = buildImprovement(
      setup({ owner: 1, actor: 0, improvement: 'Major_Fireplace1' }),
      0,
      'Major_Fireplace1',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, food: 1 })
  })

  it('C137 S4: building the non-baking Well grants no Charcoal Burner reward', () => {
    const response = buildImprovement(setup({ improvement: 'Major_Well' }), 0, 'Major_Well')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Well')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0, food: 0 })
  })

  it('C137 S5: the owner playing a baking minor gains one wood and one food', () => {
    const response = buildImprovement(setup({ improvement: BAKING_MINOR_ID }), 0, BAKING_MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(BAKING_MINOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 1 })
  })

  it('C137 S6: another player playing a baking minor rewards the owner', () => {
    const response = buildImprovement(
      setup({ owner: 1, actor: 0, improvement: BAKING_MINOR_ID }),
      0,
      BAKING_MINOR_ID,
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(BAKING_MINOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, food: 1 })
  })
})
