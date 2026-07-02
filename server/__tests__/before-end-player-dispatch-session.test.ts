import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { PlayerState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

const SHARED_CARD = 'TEST_BeforeEndShared'
const OWNER_CARD = 'TEST_BeforeEndOwner'
const PREVIEW_CARD = 'TEST_BeforeEndPreviewMutation'

const setPlaceholderHands = (player: PlayerState) => {
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
}

const setupEndGameSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.gameOver = false
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 0)
    setPlaceholderHands(player)
    player.resources.food = 0
    player.resources.wood = 1
    player.occupationPlayed = []
    player.minorPlayed = []
    player.improvements = []
    player.cardStates = {}
  })
  state.players[0]!.occupationPlayed = [SHARED_CARD]
  session.loadState(state)

  const sharedEffect: CardEffect = {
    id: SHARED_CARD,
    onBeforeEndGame: (_state, player) => {
      if (player.resources.wood <= 0) return
      return {
        type: 'leaf',
        actionId: 'gain',
        params: { food: 1 },
        sourceCard: SHARED_CARD,
      }
    },
    beforeEndGameScope: 'allPlayers',
  }
  const ownerEffect: CardEffect = {
    id: OWNER_CARD,
    onBeforeEndGame: (_state, player) => {
      player.resources.vegetable += 1
    },
  }
  requireActiveCardRegistry('before-end player dispatch test').setEffect(sharedEffect)
  requireActiveCardRegistry('before-end player dispatch test').setEffect(ownerEffect)

  return session
}

const expectSharedTrigger = (resp: SessionResponse, playerIndex: number) => {
  const interaction = resp.interaction
  expect(interaction.stateId).toBe('wait')
  if (interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(interaction.playerIndex).toBe(playerIndex)
  expect(interaction.request.kind).toBe('select-trigger')
  if (interaction.request.kind !== 'select-trigger') throw new Error('expected select-trigger')
  expect(interaction.request.options).toContainEqual({
    value: SHARED_CARD,
    labelKey: `cards.${SHARED_CARD}.name`,
    sourceCard: SHARED_CARD,
  })
  expect(interaction.request.options).toContainEqual({
    value: '__pass__',
    labelKey: 'ui.interactionSelectTriggerPass',
    disabled: true,
  })
}

describe('Before-End Player Dispatch session', () => {
  it('dispatches default before-end activations through trigger-select for each target player', () => {
    const session = setupEndGameSession()
    const state = session.getState().state
    state.players[0]!.occupationPlayed = [SHARED_CARD, OWNER_CARD]
    session.loadState(state)

    let resp = session.invokeAfterRoundEnd()
    expectSharedTrigger(resp, 0)
    expect(resp.interaction.options).toContainEqual({
      value: OWNER_CARD,
      labelKey: `cards.${OWNER_CARD}.name`,
      sourceCard: OWNER_CARD,
    })

    resp = session.resolveChoice(0, OWNER_CARD)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expectSharedTrigger(resp, 0)

    resp = session.resolveChoice(0, SHARED_CARD)
    expect(resp.state.players[0]!.resources.food).toBe(1)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.fromPlayerIndex).toBe(0)
    expect(resp.interaction.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expectSharedTrigger(resp, 1)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.allowedCommands).not.toContain('undoStep')
    expect(resp.interaction.allowedCommands).not.toContain('undoAction')

    resp = session.resolveChoice(1, SHARED_CARD)
    expect(resp.state.players[1]!.resources.food).toBe(1)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.interaction.stateId).toBe('gameover')
  })

  it('keeps before-end preview mutations out of real game state until activation is selected', () => {
    const session = setupEndGameSession()
    const state = session.getState().state
    state.players[0]!.occupationPlayed = [PREVIEW_CARD]
    state.players[0]!.fields = []
    session.loadState(state)

    const effect: CardEffect = {
      id: PREVIEW_CARD,
      onBeforeEndGame: (_state, player) => {
        player.fields.push({ row: 0, col: 0, stacks: [] })
        return undefined
      },
    }
    requireActiveCardRegistry('before-end player dispatch preview test').setEffect(effect)

    let resp = session.invokeAfterRoundEnd()

    expect(resp.state.players[0]!.fields).toEqual([])
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('select-trigger')
    expect(resp.interaction.options).toContainEqual({
      value: PREVIEW_CARD,
      labelKey: `cards.${PREVIEW_CARD}.name`,
      sourceCard: PREVIEW_CARD,
    })

    resp = session.resolveChoice(0, PREVIEW_CARD)
    expect(resp.state.players[0]!.fields).toEqual([{ row: 0, col: 0, stacks: [] }])
    expect(resp.state.gameOver).toBe(true)
  })
})
