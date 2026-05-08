import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/A/A132_Publican'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { SessionResponse } from '../../shared/session/session-core'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'

describe('A132_Publican session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'

    // P0 is the Publican owner
    const owner = state.players[0]!
    owner.occupationPlayed.push('A132_Publican')
    owner.resources.grain = 3

    // P1 (opponent) needs plowed fields and grain to sow
    const opponent = state.players[1]!
    opponent.resources.grain = 2
    opponent.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ]

    session.loadState(state)
    return session
  }

  const advancePastPlayerSwitches = (session: GameSession, resp: SessionResponse) => {
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }
    return resp
  }

  it('publican can pay 1 grain for 1 VP when opponent sows', () => {
    const session = setup(1)
    const s = session.getState().state
    const ownerGrainBefore = s.players[0]!.resources.grain
    const opponentGrainBefore = s.players[1]!.resources.grain

    // Opponent (p1) takes grain-utilization
    // Since opponent can sow but can't bake bread, sow auto-selects
    // Before-sow opponent listener fires, creating PlayerSwitch to owner
    let resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok).toBe(true)

    // If it's a choice (sow/bake-bread), pick sow
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionGrainUtilizationChoice') {
      const sowOption = resp.interaction.options?.find(
        (o: ActionChoiceOption) => o.labelKey === 'actions.sow.name' || o.value === 'sow',
      )
      if (sowOption) {
        resp = session.resolveChoice(1, sowOption.value)
      }
    }

    // Walk past player switches to reach Publican's optional choice
    resp = advancePastPlayerSwitches(session, resp)

    // The optional flow should present a choice to accept or skip
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const acceptOption = resp.interaction.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)

    // Walk through any remaining player switches back to opponent for sow
    resp = advancePastPlayerSwitches(session, resp)

    // Now the sow farm interaction should be presented for opponent
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')

    // Commit the sow with 1 grain crop
    resp = session.resolveChoice(1, 'confirm', {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    resp = advancePastPlayerSwitches(session, resp)

    const after = session.getState().state
    // Owner lost 1 grain
    expect(after.players[0]!.resources.grain).toBe(ownerGrainBefore - 1)
    // Opponent: started with 2, gained 1 from Publican, sowed 1 = 2
    expect(after.players[1]!.resources.grain).toBe(opponentGrainBefore + 1 - 1)
    // Owner should have 1 bonus VP
    expect(after.players[0]!.cardStates?.A132_Publican?.counters?.bonusVp).toBe(1)
  })

  it('publican can decline the optional exchange', () => {
    const session = setup(1)
    const s = session.getState().state
    const ownerGrainBefore = s.players[0]!.resources.grain

    // Opponent (p1) takes grain-utilization → sow auto-selects
    let resp = session.takeAction(1, 'grain-utilization')
    expect(resp.ok).toBe(true)

    // If it's a choice, pick sow
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionGrainUtilizationChoice') {
      const sowOption = resp.interaction.options?.find(
        (o: ActionChoiceOption) => o.labelKey === 'actions.sow.name' || o.value === 'sow',
      )
      if (sowOption) {
        resp = session.resolveChoice(1, sowOption.value)
      }
    }

    // Walk past player switches
    resp = advancePastPlayerSwitches(session, resp)

    // The optional flow should present a choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Decline
    resp = session.resolveChoice(0, '__skip__')

    resp = advancePastPlayerSwitches(session, resp)

    // Now sow farm interaction for opponent
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')

    resp = session.resolveChoice(1, 'confirm', {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    resp = advancePastPlayerSwitches(session, resp)

    const after = session.getState().state
    // Owner resources unchanged
    expect(after.players[0]!.resources.grain).toBe(ownerGrainBefore)
    // No bonus VP
    expect(after.players[0]!.cardStates?.A132_Publican?.counters?.bonusVp).toBeUndefined()
  })

  it('does not trigger when owner takes sow themselves', () => {
    const session = setup(0)

    // Give owner fields to sow
    const state = session.getState().state
    state.players[0]!.fields = [
      { row: 0, col: 0, stacks: [] },
    ]
    session.loadState(state)

    const grainBefore = session.getState().state.players[0]!.resources.grain

    // Owner (p0) takes grain-utilization → sow auto-selects
    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)

    // If it's a choice, pick sow
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionGrainUtilizationChoice') {
      const sowOption = resp.interaction.options?.find(
        (o: ActionChoiceOption) => o.labelKey === 'actions.sow.name' || o.value === 'sow',
      )
      if (sowOption) {
        resp = session.resolveChoice(0, sowOption.value)
      }
    }

    // No PlayerSwitch should happen for own sow
    resp = advancePastPlayerSwitches(session, resp)

    // Should go directly to sow interaction
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')

    resp = session.resolveChoice(0, 'confirm', {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    resp = advancePastPlayerSwitches(session, resp)

    const after = session.getState().state
    // No bonus VP should be gained (owner sowed, not opponent)
    expect(after.players[0]!.cardStates?.A132_Publican?.counters?.bonusVp).toBeUndefined()
    // Owner should only have lost grain from sowing
    expect(after.players[0]!.resources.grain).toBe(grainBefore - 1)
  })
})
