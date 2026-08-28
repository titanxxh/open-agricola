import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/E/E024_Ambition'
import '../../shared/cards/B/B103_FieldMerchant'
import '../../shared/cards/A/A096_TaskArtisan'

const AMBITION = 'E024_Ambition'
const FIELD_MERCHANT = 'B103_FieldMerchant'
const TASK_ARTISAN = 'A096_TaskArtisan'
const PLACEHOLDER = '__test_placeholder__'

const setup = (options: {
  ambition?: boolean
  fieldMerchant?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(24)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options.round ?? 1
  state.roundPhase = 'work'

  for (const player of state.players) {
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
  }

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  if (options.ambition !== false) player.minorPlayed.push(AMBITION)
  if (options.fieldMerchant) player.occupationPlayed.push(FIELD_MERCHANT)
  Object.assign(player.resources, {
    wood: 10,
    clay: 10,
    reed: 10,
    stone: 10,
    food: 10,
    vegetable: 0,
  })

  session.loadState(state)
  return session
}

const enterMeetingPlaceImprovement = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp

  const enterImprovement = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(enterImprovement).toBeDefined()
  if (!enterImprovement) return resp
  resp = session.resolveChoice(0, enterImprovement.value)
  return resp
}

describe('E024_Ambition session', () => {
  it('builds a major when a literal Minor Improvement action has no playable minor', () => {
    const session = setup()
    let resp = enterMeetingPlaceImprovement(session)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionChooseImprovement')
    expect(resp.interaction.request.options?.map((option) => option.value)).toContain('Major_Pottery')

    resp = session.resolveChoice(0, 'Major_Pottery')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain('Major_Pottery')
    expect(resp.state.availableMajorImprovements).not.toContain('Major_Pottery')
  })

  it('keeps Field Merchant typed as minor without hiding Ambition majors', () => {
    const replacedSession = setup({ fieldMerchant: true })
    let resp = enterMeetingPlaceImprovement(replacedSession)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionFlowSelect')
    const merchantOptions = resp.interaction.request.options?.filter((option) => option.sourceCard === FIELD_MERCHANT) ?? []
    expect(merchantOptions).toHaveLength(1)
    expect(merchantOptions[0]?.effectPreview?.resourcesGained).toMatchObject({ food: 1 })
    expect(merchantOptions[0]?.effectPreview?.resourcesGained?.vegetable).toBeUndefined()

    resp = replacedSession.resolveChoice(0, merchantOptions[0]!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(11)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)

    const originalSession = setup({ fieldMerchant: true })
    resp = enterMeetingPlaceImprovement(originalSession)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const original = resp.interaction.request.options?.find((option) => !option.sourceCard)
    expect(original).toBeDefined()
    if (!original) return

    resp = originalSession.resolveChoice(0, original.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.map((option) => option.value)).toContain('Major_Pottery')
  })

  it('lets Field Merchant choose exactly one reward on a Major or Minor Improvement action', () => {
    for (const resource of ['food', 'vegetable'] as const) {
      const session = setup({ ambition: false, fieldMerchant: true, round: 14 })
      const before = { ...session.getState().state.players[0]!.resources }
      let resp = session.takeAction(0, 'major-improvement')

      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const merchantOptions = resp.interaction.request.options?.filter((option) => option.sourceCard === FIELD_MERCHANT) ?? []
      expect(merchantOptions).toHaveLength(2)
      const choice = merchantOptions.find((option) => option.effectPreview?.resourcesGained?.[resource] === 1)
      expect(choice).toBeDefined()
      if (!choice) return

      resp = session.resolveChoice(0, choice.value)
      const other = resource === 'food' ? 'vegetable' : 'food'
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources[resource]).toBe(before[resource] + 1)
      expect(resp.state.players[0]!.resources[other]).toBe(before[other])
    }
  })

  it('does not extend a card-derived Minor Improvement action', () => {
    const session = setup({ round: 5 })
    const state = session.getState().state
    state.roundPhase = 'preparation'
    state.roundActionOrder[4] = 'western-quarry'
    state.players[0]!.occupationPlayed.push(TASK_ARTISAN)
    const wood = state.players[0]!.resources.wood
    session.loadState(state)

    const resp = session.continueBeforeStartOfTurn()

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(wood + 1)
    expect(resp.interaction.stateId).toBe('idle')
  })
})
