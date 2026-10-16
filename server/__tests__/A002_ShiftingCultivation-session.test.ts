import { describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { assertRejectedUnchanged, assertUndoRestored, getChoiceOptions, undoRuleSnapshot } from './_helpers/session-assertions'

const CARD_ID = 'A002_ShiftingCultivation'
const evidence = createScenarioEvidence(import.meta.url)

const setup = (food: number) => evidence.track(createWorkSession({
  configure(state) {
    state.players[0]!.minorHand = [CARD_ID]
    state.players[0]!.resources.food = food
  }
}))

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  const improvement = getChoiceOptions(response).find(option => option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const cardOption = (response: SessionResponse) => getChoiceOptions(response).find(option => option.value === CARD_ID)

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = cardOption(response)
  if (!option) throw new Error('Expected Shifting Cultivation purchase')
  return session.resolveChoice(0, option.value)
}

const acceptPlow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID })
  const accept = getChoiceOptions(response).find(option => option.value !== '__skip__')
  if (!accept) throw new Error('Expected optional plow acceptance')
  return session.resolveChoice(0, accept.value)
}

describe('A002 Shifting Cultivation parity', () => {
  it('paid optional plow rejects an occupied tile, retries once, and restores payment and passing on undo', () => {
    const session = setup(2)
    const before = undoRuleSnapshot(session.getState())
    let response = acceptPlow(session, playMinor(session))
    expect(response.ok, response.error).toBe(true)
    const interaction = response.interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind !== 'farm-select'
      || interaction.request.farm.farmType !== 'plow') throw new Error('Expected plow selection')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    const occupied = response.state.players[0]!.roomTiles[0]!
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile: occupied }))
    const tile = interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { tile })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toEqual([{ ...tile, stacks: [] }])
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile }))
    const undone = session.undoAction()
    assertUndoRestored(before, undone)
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.currentPlayerIndex).toBe(0)

    acceptPlow(session, playMinor(session))
    const retry = session.commitSelectionChoice(0, { tile })
    expect(retry.ok, retry.error).toBe(true)
    expect(retry.state.players[0]!.fields).toEqual([{ ...tile, stacks: [] }])
    expect(retry.state.players[0]!.resources.food).toBe(0)
    expect(retry.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(retry.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })
  })

  it('A002 S2: paid optional plow can be declined after the card passes', () => {
    const session = setup(2)
    let response = playMinor(session)
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A002 S3: less than two food keeps Shifting Cultivation unavailable', () => {
    const response = openMinorPrompt(setup(1))
    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })
})
