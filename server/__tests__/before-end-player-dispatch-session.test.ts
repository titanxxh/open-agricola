import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { PlayerState } from '../../shared/contract/types'

const SHARED_CARD = 'TEST_BeforeEndShared'
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

  const effect: CardEffect = {
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
  }
  Object.assign(effect, {
    beforeEndGameScope: 'allPlayers',
    beforeEndGameDispatchMode: 'select',
    beforeEndGameMandatory: true,
  })
  requireActiveCardRegistry('before-end player dispatch test').setEffect(effect)

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
  it('dispatches all-player select before-end activations for each target player', () => {
    const session = setupEndGameSession()

    let resp = session.invokeAfterRoundEnd()
    expectSharedTrigger(resp, 0)

    resp = session.resolveChoice(0, SHARED_CARD)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expectSharedTrigger(resp, 1)

    resp = session.resolveChoice(1, SHARED_CARD)
    expect(resp.state.players[1]!.resources.food).toBe(1)
    expect(resp.state.gameOver).toBe(true)
    expect(resp.interaction.stateId).toBe('gameover')
  })

  it('keeps select before-end preview mutations out of real game state', () => {
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
      beforeEndGameDispatchMode: 'select',
      beforeEndGameMandatory: true,
    }
    requireActiveCardRegistry('before-end player dispatch preview test').setEffect(effect)

    const resp = session.invokeAfterRoundEnd()

    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.fields).toEqual([])
  })
})
