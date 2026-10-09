import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/A/A132_Publican'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { SessionResponse } from '../../shared/session/session-core'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('stats: gain with recipientPlayerId records resourcesFromCards on target', () => {
  const advancePastPlayerSwitches = (
    session: GameSession,
    resp: SessionResponse,
  ) => {
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }
    return resp
  }

  it('Publican (gain with recipientPlayerId + sourceCard) credits opponent stats.resourcesFromCards', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 1
    state.round = 1
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'

    const owner = state.players[0]!
    owner.occupationPlayed.push('A132_Publican')
    owner.resources.grain = 3

    const opponent = state.players[1]!
    opponent.resources.grain = 2
    opponent.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ]

    session.loadState(state)

    let resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok).toBe(true)

    if (
      resp.interaction.stateId === 'wait' &&
      resp.interaction.promptKey === 'ui.interactionGrainUtilizationChoice'
    ) {
      const sowOption = resp.interaction.request.options?.find(
        (o: ActionChoiceOption) =>
          o.labelKey === 'actions.sow.name' || o.value === 'sow',
      )
      if (sowOption) {
        resp = session.resolveChoice(1, sowOption.value)
      }
    }

    resp = advancePastPlayerSwitches(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Under PARALLEL dispatch, the Publican listener is wrapped in a select-trigger prompt.
    // Activate Publican via select-trigger first, then resolve its optional pay choice.
    if (resp.interaction.request.kind === 'select-trigger') {
      const publiOpt = resp.interaction.request.options.find((o) => o.sourceCard === 'A132_Publican')
      expect(publiOpt).toBeDefined()
      resp = session.resolveChoice(0, publiOpt?.value ?? '__pass__')
      resp = advancePastPlayerSwitches(session, resp)
    }

    const acceptOption = resp.interaction.request.options?.find(
      (o: ActionChoiceOption) => o.value !== '__skip__',
    )
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    resp = advancePastPlayerSwitches(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    expect(
      resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined,
    ).toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(1, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    resp = advancePastPlayerSwitches(session, resp)

    const after = session.getState().state
    // Opponent (recipientPlayerId target) should record 1 grain in resourcesFromCards.
    expect(after.players[1]!.stats.resourcesFromCards.grain).toBe(1)
    // Owner did not gain via recipientPlayerId path → no resourcesFromCards bump for owner from this path.
    expect(after.players[0]!.stats.resourcesFromCards.grain ?? 0).toBe(0)
  })
})
