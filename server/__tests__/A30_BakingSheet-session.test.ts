import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A030_BakingSheet'

const CARD_ID = 'A030_BakingSheet'
const FILLER = '__test_placeholder__'

const setup = ({ grain = 2, fieldGrain = 0, played = true } = {}) => {
  const session = new GameSession(5030, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.improvements = ['Major_Fireplace1']
  player.resources.grain = grain
  player.resources.food = 0
  player.fields = fieldGrain > 0
    ? [{ row: 1, col: 0, stacks: [{ kind: 'grain', remaining: fieldGrain }] }]
    : []
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const bakeOne = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.options?.some((option) =>
      option.value === 'Major_Fireplace1' || option.sourceCard === 'Major_Fireplace1')) {
    const bake = response.interaction.request.options?.find((option) =>
      option.value === 'Major_Fireplace1' || option.sourceCard === 'Major_Fireplace1')
    expect(bake).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, bake!.value)
  }
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionBakeBreadCount') {
    const one = response.interaction.request.options?.find((option) =>
      option.value === 'count-Major_Fireplace1-1')
    expect(one).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, one!.value)
  }
  return response
}

const acceptBakingSheet = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

const bonusVp = (session: GameSession) =>
  session.getState().scores[0]!.categories
    .find((category) => category.key === 'cardBonusVp')
    ?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0

describe('A030 Baking Sheet parity', () => {
  it('A030 S1: no grain field allows playing Baking Sheet for no resources', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A030 S2: a grain field keeps Baking Sheet unavailable', () => {
    const response = openMinorPrompt(setup({ played: false, fieldGrain: 1 }))

    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false
      : false).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A030 S3: after a normal bake, one extra grain gives two food and one bonus point', () => {
    const session = setup({ grain: 2 })
    const response = acceptBakingSheet(session, bakeOne(session))

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
    expect(bonusVp(session)).toBe(1)
  })

  it('A030 S4: declining Baking Sheet keeps the grain left after normal baking', () => {
    const session = setup({ grain: 2 })
    let response = resolveTriggerIfPresent(session, bakeOne(session), CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
    expect(bonusVp(session)).toBe(0)
  })

  it('A030 S5: spending the last grain on normal baking grants no Baking Sheet reward', () => {
    const session = setup({ grain: 1 })
    const response = bakeOne(session)

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(bonusVp(session)).toBe(0)
  })
})
