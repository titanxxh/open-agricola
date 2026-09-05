import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'
import { computeScores } from '../../shared/domain/scoring'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

import '../../shared/cards/E/E132_VeggieLover'

const CARD_ID = 'E132_VeggieLover'
const CHOICE_PREFIX = `${CARD_ID}:pairs:`

const choiceValue = (pairs: number) => `${CHOICE_PREFIX}${pairs}`

const setupEndGameSession = (grain: number, vegetable: number) => {
  const session = new GameSession(132, undefined, { playerCount: 3 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.gameOver = false
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 0)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.occupationPlayed = []
    player.minorPlayed = []
    player.improvements = []
    player.cardStates = {}
  })
  state.players[0]!.occupationPlayed = [CARD_ID]
  state.players[0]!.resources.grain = grain
  state.players[0]!.resources.vegetable = vegetable
  session.loadState(state)
  return session
}

const expectPairChoice = (response: SessionResponse, values: string[]) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(response.interaction.playerIndex).toBe(0)
  expect(response.interaction.request.kind).toBe('choice')
  expect(response.interaction.promptKey).toBe('ui.cards.E132_VeggieLover.prompt')
  expect(response.interaction.request.options?.map((option) => option.value)).toEqual(values)
}

const scoreCategory = (response: SessionResponse, key: string) =>
  computeScores(response.state)[0]!.categories.find((category) => category.key === key)

describe('E132_VeggieLover session', () => {
  it('offers optional feeding exchange when player has grain and vegetable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 2
    player.resources.vegetable = 1

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).optional).toBe(true)
  })

  it('returns undefined when player has no grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 0
    player.resources.vegetable = 2

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect!.onHarvestFeedingPhase!(state, player)).toBeUndefined()
  })

  it('returns undefined when player has no vegetable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 3
    player.resources.vegetable = 0

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect!.onHarvestFeedingPhase!(state, player)).toBeUndefined()
  })

  it('offers zero through three pairs and truly pays the selected pair before scoring', () => {
    const session = setupEndGameSession(3, 3)

    const offered = session.invokeAfterRoundEnd()
    expectPairChoice(offered, [
      choiceValue(0),
      choiceValue(1),
      choiceValue(2),
      choiceValue(3),
    ])

    const resolved = session.resolveChoice(0, choiceValue(1))

    expect(resolved.interaction.stateId).toBe('gameover')
    expect(resolved.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 2 })
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toBeUndefined()
    expect(scoreCategory(resolved, 'grains')?.quantity).toBe(2)
    expect(scoreCategory(resolved, 'vegetables')?.quantity).toBe(2)
    expect(scoreCategory(resolved, 'cardBonusVp')?.entries).toContainEqual(
      expect.objectContaining({ cardId: CARD_ID, score: 2 }),
    )
  })

  it('choosing zero changes neither resources nor bonus state', () => {
    const session = setupEndGameSession(3, 3)
    const offered = session.invokeAfterRoundEnd()
    expectPairChoice(offered, [
      choiceValue(0),
      choiceValue(1),
      choiceValue(2),
      choiceValue(3),
    ])

    const resolved = session.resolveChoice(0, choiceValue(0))

    expect(resolved.state.players[0]!.resources).toMatchObject({ grain: 3, vegetable: 3 })
    expect(resolved.state.players[0]!.cardStates[CARD_ID]).toBeUndefined()
    expect(scoreCategory(resolved, 'cardBonusVp')).toBeUndefined()
  })

  it('limits choices to crops not already committed to a Scoring Reserve', () => {
    const session = setupEndGameSession(3, 3)
    session.state.players[0]!.cardStates = {
      TEST_Reserve: {
        extraData: {
          scoringReserveBonus: { reserved: { grain: 2 }, score: 1 },
        },
      },
    }
    session.loadState(session.state)

    const offered = session.invokeAfterRoundEnd()

    expectPairChoice(offered, [choiceValue(0), choiceValue(1)])
  })

  it('restores a pending pair choice and rejects a repeated command after scoring', () => {
    const session = setupEndGameSession(2, 2)
    const offered = session.invokeAfterRoundEnd()
    expectPairChoice(offered, [choiceValue(0), choiceValue(1), choiceValue(2)])
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))

    const resolved = restored.resolveChoice(0, choiceValue(2))

    expect(resolved.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(4)
    expect(resolved.interaction.stateId).toBe('gameover')
    const repeated = restored.resolveChoice(0, choiceValue(2))
    expect(repeated.ok).toBe(false)
    expect(repeated.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
    expect(repeated.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(4)
  })
})
