import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A060_OrientalFireplace'

const CARD_ID = 'A060_OrientalFireplace'
const FIREPLACE_ID = 'Major_Fireplace1'
const COOKING_HEARTH_ID = 'Major_CookingHearth1'
const FILLER = '__test_placeholder__'

const setupPurchase = (fireplace = true) => {
  const session = new GameSession(5060, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = [FILLER]
  player.improvements = fireplace ? [FIREPLACE_ID] : []
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    grain: 0,
    vegetable: 0,
    food: 0,
  }
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const play = (session: GameSession): SessionResponse => {
  let response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (!option) return response
  response = session.resolveChoice(0, option.value)
  return response
}

const setupPlayed = (resources: Partial<{
  vegetable: number
  sheep: number
  cattle: number
  grain: number
}> = {}) => {
  const session = new GameSession(6060, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = [CARD_ID]
  player.minorHand = [FILLER]
  player.occupationHand = [FILLER]
  player.resources = {
    ...player.resources,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    cattle: 0,
    ...resources,
  }
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy = []
  state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy = []
  session.loadState(state)
  return session
}

describe('A060 Oriental Fireplace parity', () => {
  it('A060 S1: returning a Fireplace plays Oriental Fireplace without resources', () => {
    const response = play(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(FIREPLACE_ID)
    expect(response.state.availableMajorImprovements).toContain(FIREPLACE_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0,
    })
  })

  it('A060 S2: without a Fireplace or Cooking Hearth Oriental Fireplace is unavailable', () => {
    const response = enterImprovementChoice(setupPurchase(false))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.interaction.stateId !== 'wait'
      || !(response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)).toBe(true)
  })

  it('A060 S3: anytime exchanges convert vegetables, sheep, and cattle at printed rates', () => {
    const session = setupPlayed({ vegetable: 1, sheep: 2, cattle: 1 })
    expect(session.takeAction(0, 'farmland').ok).toBe(true)

    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, 'bulk:0=1,1=2,2=1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      vegetable: 0, sheep: 0, cattle: 0, food: 15,
    })
  })

  it('A060 S4: grain is excluded from anytime cooking and bakes for two food per grain', () => {
    const session = setupPlayed({ grain: 2 })
    const active = session.takeAction(0, 'farmland')
    expect(active.ok, active.error).toBe(true)
    expect(active.interaction.anytimeActions.map((action) => action.id)).not.toContain('exchange')

    const bakeSession = setupPlayed({ grain: 2 })
    let response = bakeSession.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const bakeOptions = response.interaction.request.options?.map((option) => option.value) ?? []
    expect(bakeOptions).toContain(`count-${CARD_ID}-2`)
    response = bakeSession.resolveChoice(0, `count-${CARD_ID}-2`)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
  })

  it('A060 S5: upgrading Oriental Fireplace removes it instead of returning it to major supply', () => {
    const session = setupPlayed()
    const state = session.getState().state
    state.availableMajorImprovements = [COOKING_HEARTH_ID]
    session.loadState(state)

    let response = session.takeAction(0, 'major-improvement')
    if (!response.state.players[0]!.improvements.includes(COOKING_HEARTH_ID)
      && response.interaction.stateId === 'wait') {
      const option = response.interaction.request.options?.find((candidate) =>
        candidate.value === COOKING_HEARTH_ID)
      if (option) response = session.resolveChoice(0, option.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(COOKING_HEARTH_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.availableMajorImprovements).not.toContain(CARD_ID)
  })
})
