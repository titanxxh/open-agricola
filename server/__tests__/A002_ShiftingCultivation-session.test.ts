import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A002_ShiftingCultivation'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit02Immediate from './_helpers/audit/ae-negative-02-immediate'

const CARD_ID = 'A002_ShiftingCultivation'

const setup = (food: number) => {
  const session = new GameSession(2, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources.food = food
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
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = cardOption(response)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const acceptPlow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID })
  if (response.interaction.stateId !== 'wait') return response
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(0, accept!.value)
}

describe('A002 Shifting Cultivation parity', () => {
  it('A002 S1: paid optional plow rejects an occupied tile then accepts a legal retry and passes', () => {
    const session = setup(2)
    let response = acceptPlow(session, playMinor(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
      throw new Error('expected plow selection')
    }
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
    const occupied = response.state.players[0]!.roomTiles[0]!
    const rejected = session.commitSelectionChoice(0, { tile: occupied })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.fields).toHaveLength(0)
    expect(rejected.interaction).toEqual(response.interaction)

    const tile = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { tile })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
  })

  it('A002 S2: paid optional plow can be declined after the card passes', () => {
    const session = setup(2)
    let response = playMinor(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected optional plow')

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(response.state.players[1]!.minorHand).toContain(CARD_ID)
  })

  it('A002 S3: less than two food keeps Shifting Cultivation unavailable', () => {
    const session = setup(1)
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })
})

describe('ae-negative-02-immediate', () => {
  const { setup, requireWait, play, accept } = audit02Immediate
  describe('negative audit 02 immediate effects', () => {
    it('A002 N1: Shifting Cultivation rejects an occupied field then refunds one-field play on undo', () => {
        const session = setup('A002_ShiftingCultivation', state => { state.players[0]!.resources.food = 2 })
        const before = undoRuleSnapshot(session.getState())
        let response = accept(session, play(session, 'A002_ShiftingCultivation'))
        const interaction = requireWait(response)
        assert(interaction.request.kind === 'farm-select')
        assert(interaction.request.farm.farmType === 'plow')
        const tile = interaction.request.farm.selectableTiles[0]!
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile: response.state.players[0]!.roomTiles[0]! }))
        response = session.commitSelectionChoice(0, { tile })
        assert.equal(response.ok, true, response.error)
        assert.deepEqual(response.state.players[0]!.fields, [{ ...tile, stacks: [] }])
        assert.equal(response.state.players[0]!.resources.food, 0)
        assert(response.state.players[1]!.minorHand.includes('A002_ShiftingCultivation'))
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile }))
        assertUndoRestored(before, session.undoAction())
        session.dispose()
      })
  })
})
