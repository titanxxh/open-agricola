import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardEffect } from '../../shared/cards/card-effects'
import type { PlayerState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

const P0_CARD = 'TEST_StageHookP0'
const P1_CARD = 'TEST_StageHookP1'

const setPlaceholderHands = (player: PlayerState) => {
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
}

const choiceEffect = (id: string): CardEffect => ({
  id,
  onBeforeReturnHome: () => ({
    type: 'xor',
    children: [
      { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: id, choiceLabelKey: 'test.food' },
      { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: id, choiceLabelKey: 'test.wood' },
    ],
  }),
})

const setupSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.players.forEach((player) => {
    setPlaceholderHands(player)
    player.occupationPlayed = []
    player.minorPlayed = []
    player.improvements = []
    player.cardStates = {}
  })
  state.players[0]!.occupationPlayed = [P0_CARD]
  state.players[1]!.occupationPlayed = [P1_CARD]
  session.loadState(state)
  requireActiveCardRegistry('stage hook player switch boundary test').setEffect(choiceEffect(P0_CARD))
  requireActiveCardRegistry('stage hook player switch boundary test').setEffect(choiceEffect(P1_CARD))
  return session
}

const expectStageChoice = (resp: SessionResponse, playerIndex: number) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(resp.interaction.playerIndex).toBe(playerIndex)
  expect(resp.interaction.request.kind).toBe('choice')
}

describe('stage hook player switch undo boundary', () => {
  it('inserts a player-switch boundary between prompted stage hook owners', () => {
    const session = setupSession()

    let resp = session.invokeBeforeReturnHomeHooks()
    expectStageChoice(resp, 0)

    resp = session.resolveChoice(0, resp.interaction.options![0]!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.fromPlayerIndex).toBe(0)
    expect(resp.interaction.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expectStageChoice(resp, 1)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.allowedCommands).not.toContain('undoStep')
    expect(resp.interaction.allowedCommands).not.toContain('undoAction')
    expect(resp.historyLength).toBe(0)

    const undo = session.undoStep()
    expect(undo.ok).toBe(false)
    expect(undo.ok ? '' : undo.error).toBe('cannot undo past boundary')
  })
})
