import { describe, expect, it } from 'vitest'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { SessionResponse } from '../../shared/session/session-core'
import { GameSession } from '../game/authoritative-session'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A132_Publican'

const CARD_ID = 'A132_Publican'

describe('A132_Publican four-player parity prototype', () => {
  const setup = (currentPlayerIndex: number, opponentGrain = 2) => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'

    const owner = state.players[0]!
    owner.occupationPlayed.push(CARD_ID)
    owner.resources.grain = 3
    owner.fields = [{ row: 0, col: 0, stacks: [] }]

    const opponent = state.players[1]!
    opponent.resources.grain = opponentGrain
    opponent.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ]

    state.players.forEach((player, index) => setWorkersAtHome(state, player, index < 2 ? 2 : 0))
    session.loadState(state)
    return session
  }

  const advancePastPlayerSwitches = (session: GameSession, response: SessionResponse) => {
    while (
      response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch'
    ) {
      response = confirmPlayerSwitch(session)
    }
    return response
  }

  const startSow = (session: GameSession, playerIndex: number) => {
    let response = session.takeAction(playerIndex, 'grain-utilization')
    expect(response.ok).toBe(true)
    if (
      response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionGrainUtilizationChoice'
    ) {
      const sow = response.interaction.request.options.find((option) => option.value === 'sow')
      expect(sow).toBeDefined()
      response = session.resolveChoice(playerIndex, sow!.value)
    }
    return advancePastPlayerSwitches(session, response)
  }

  const expectSowSelection = (response: SessionResponse, playerIndex: number) => {
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex,
      request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
  }

  const acceptPublican = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      sourceCard: CARD_ID,
      request: { kind: 'choice' },
    })
    if (response.interaction.stateId !== 'wait') throw new Error('expected Publican choice')
    const accept = response.interaction.request.options.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    return advancePastPlayerSwitches(session, session.resolveChoice(0, accept!.value))
  }

  it('accepts the offer and completes the opponent sow', () => {
    const session = setup(1)
    let response = acceptPublican(session, startSow(session, 1))
    expectSowSelection(response, 1)

    response = session.commitSelectionChoice(1, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[1]!.resources.grain).toBe(2)
    expect(response.state.players[1]!.fields[0]!.stacks[0]?.kind).toBe('grain')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(response.state.log.filter((entry) => entry.key === 'log.provisionalContinuationRollback')).toHaveLength(0)
    expect(response.scores).toHaveLength(4)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total).toBe(1)
  })

  it('declines the offer and still completes the opponent sow', () => {
    const session = setup(1)
    let response = startSow(session, 1)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      sourceCard: CARD_ID,
      request: { kind: 'choice' },
    })

    response = advancePastPlayerSwitches(session, session.resolveChoice(0, '__skip__'))
    expectSowSelection(response, 1)
    response = session.commitSelectionChoice(1, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(3)
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[1]!.fields[0]!.stacks[0]?.kind).toBe('grain')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    expect(response.scores).toHaveLength(4)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
  })

  it('does not trigger for the owner sowing', () => {
    const session = setup(0)
    let response = startSow(session, 0)

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expectSowSelection(response, 0)
    response = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[0]!.fields[0]!.stacks[0]?.kind).toBe('grain')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    expect(response.scores).toHaveLength(4)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
  })

  it('offers grain and completes the opponent sow from zero grain', () => {
    const session = setup(1, 0)
    let response = acceptPublican(session, startSow(session, 1))
    expectSowSelection(response, 1)

    response = session.commitSelectionChoice(1, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.players[1]!.fields[0]!.stacks[0]?.kind).toBe('grain')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(response.state.log.filter((entry) => entry.key === 'log.provisionalContinuationRollback')).toHaveLength(0)
    expect(response.scores).toHaveLength(4)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total).toBe(1)
  })
})
