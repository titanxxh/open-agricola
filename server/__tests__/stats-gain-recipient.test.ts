import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/A/A132_Publican'
import type { ActionChoiceOption, PendingAction } from '../../shared/game/types'
import type { SessionResponse } from '../../shared/session/session-core'

describe('stats: gain with recipientPlayerId records resourcesFromCards on target', () => {
  const advancePastPlayerSwitches = (
    session: GameSession,
    resp: SessionResponse,
  ) => {
    while (resp.pending.type === 'confirmPlayerSwitch') {
      resp = session.confirmPlayerSwitch()
    }
    return resp
  }

  it('Publican (gain with recipientPlayerId + sourceCard) credits opponent stats.resourcesFromCards', () => {
    const session = new GameSession()
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
      resp.pending.type === 'choice' &&
      resp.pending.promptKey === 'ui.interactionGrainUtilizationChoice'
    ) {
      const sowOption = resp.pending.options?.find(
        (o: ActionChoiceOption) =>
          o.labelKey === 'actions.sow.name' || o.value === 'sow',
      )
      if (sowOption) {
        resp = session.resolveChoice(1, sowOption.value)
      }
    }

    resp = advancePastPlayerSwitches(session, resp)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const acceptOption = resp.pending.options?.find(
      (o: ActionChoiceOption) => o.value !== '__skip__',
    )
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    resp = advancePastPlayerSwitches(session, resp)
    expect(resp.pending.type).toBe('choice')
    expect(
      (resp.pending as Extract<PendingAction, { type: 'choice' }>).promptKey,
    ).toBe('ui.interactionSowSelect')

    resp = session.resolveChoice(1, 'confirm', {
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
