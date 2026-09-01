import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C039_StudioBoat'

const CARD_ID = 'C039_StudioBoat'
const FIXED_HANDS = [
  { occupation: '__c039_occupation_p1__', minor: CARD_ID },
  { occupation: '__c039_occupation_p2__', minor: '__c039_minor_p2__' },
  { occupation: '__c039_occupation_p3__', minor: '__c039_minor_p3__' },
  { occupation: '__c039_occupation_p4__', minor: '__c039_minor_p4__' },
]

const setup = (playerCount: 3 | 4, played = false, startPlayerIndex = 0) => {
  const session = new GameSession(39, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = startPlayerIndex
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.startPlayer = index === startPlayerIndex
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
    player.minorHand = [FIXED_HANDS[index]!.minor]
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [FIXED_HANDS[0]!.occupation]
  owner.resources.wood = 1
  if (played) {
    owner.minorHand = ['__c039_minor_p1__']
    owner.minorPlayed = [CARD_ID]
    state.actionSpaces.push(...createPlayerActionSpaces(state))
  }
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.request.options?.some((option) => option.value === CARD_ID)) return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options?.find((option) => option.value === CARD_ID)
  : undefined

const playMinor = (session: GameSession) => {
  const prompt = openMinorPrompt(session)
  if (prompt.state.players[0]!.minorPlayed.includes(CARD_ID)) return prompt
  const option = cardOption(prompt)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('C039_StudioBoat — computeBonusScore wiring', () => {
  it('exposes computeBonusScore on the effect', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.computeBonusScore).toBeDefined()
  })

  it('returns the bonusVp counter accumulated on cardStates', () => {
    const session = setup(3, true)
    const state = session.getState().state
    const player = state.players[0]!
    player.cardStates = player.cardStates ?? {}
    player.cardStates[CARD_ID] = { counters: { bonusVp: 4 } }
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const score = effect!.computeBonusScore!(state, player, { reserved: {} })
    expect(score).toBe(4)
  })

  it('returns 0 when no counter is set', () => {
    const session = setup(3, true)
    const state = session.getState().state
    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const score = effect!.computeBonusScore!(state, player, { reserved: {} })
    expect(score).toBe(0)
  })
})

describe('C039 Studio Boat session', () => {
  it('C039 S1: a three-player owner needs one occupation, pays one wood, and creates an all-access action space', () => {
    const blocked = setup(3)
    const blockedState = blocked.getState().state
    blockedState.players[0]!.occupationPlayed = []
    blocked.loadState(blockedState)
    const blockedPrompt = openMinorPrompt(blocked)

    expect(cardOption(blockedPrompt)).toBeUndefined()
    expect(blockedPrompt.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(blockedPrompt.state.players[0]!.resources.wood).toBe(1)

    const session = setup(3)
    const response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)).toBeDefined()
    expect(session.getActionAvailability(1)[CARD_ID]).toBe(true)
  })

  it.each([
    { actorIndex: 0, ownerBonusVp: 1 },
    { actorIndex: 1, ownerBonusVp: 0 },
  ])('C039 S2: the three-player space accumulates food and actor $actorIndex leaves owner at $ownerBonusVp bonus VP', ({ actorIndex, ownerBonusVp }) => {
    const session = setup(3, true, actorIndex)
    const beforeRound = session.getState().state
    beforeRound.players.forEach((player) => markAllWorkersUsed(beforeRound, player))
    session.loadState(beforeRound)

    const nextRound = session.performRoundEnd()
    expect(nextRound.ok, nextRound.error).toBe(true)
    expect(nextRound.state.actionSpaces.find((space) => space.id === CARD_ID)?.resources.food).toBe(1)
    const foodBefore = nextRound.state.players[actorIndex]!.resources.food

    const response = session.takeAction(actorIndex, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[actorIndex]!.resources.food).toBe(foodBefore + 1)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(ownerBonusVp)
  })
})
