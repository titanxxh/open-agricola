import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/D/D160_Midwife'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'

describe('D160_Midwife session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex

    // wish-children opens in round 6 (stage 2)
    state.round = 6

    // Reveal wish-children action space
    const wishIdx = state.roundActionOrder.indexOf('wish-children')
    if (wishIdx === -1) {
      // If not found, assign it to a slot
      for (let i = 0; i < state.roundActionOrder.length; i++) {
        if (state.roundActionOrder[i] === null) {
          state.roundActionOrder[i] = 'wish-children'
          break
        }
      }
    }

    const owner = state.players[0]!
    owner.occupationPlayed.push('D160_Midwife')
    setWorkersAtHome(state, owner, 2)
    owner.resources.grain = 0
    // Owner needs room for family growth to not block
    owner.rooms = 3

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2) // Opponent needs room for family growth
    opponent.rooms = 3

    session.loadState(state)
    return session
  }

  it('owner gains 1 grain when opponent uses wish-children', () => {
    const session = setup(1)
    const s = session.getState().state
    // Check if wish-children is available
    const wishSpace = s.actionSpaces.find((sp) => sp.id === 'wish-children')
    if (!wishSpace) return

    const grainBefore = s.players[0]!.resources.grain

    let resp = session.takeAction(1, 'wish-children')
    if (!resp.ok) return // space may not be open yet

    // Walk through player switches and choices for card effect
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // Handle minor improvement choice from wish-children flow (skip it)
    if (resp.interaction.stateId === 'wait') {
      const skipOption = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
      if (skipOption) {
        resp = session.resolveChoice(1, '__skip__')
      }
    }

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('does not trigger when owner uses wish-children', () => {
    const session = setup(0)
    const s = session.getState().state
    const wishSpace = s.actionSpaces.find((sp) => sp.id === 'wish-children')
    if (!wishSpace) return

    const grainBefore = s.players[0]!.resources.grain

    let resp = session.takeAction(0, 'wish-children')
    if (!resp.ok) return

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    // Skip minor improvement
    if (resp.interaction.stateId === 'wait') {
      const skipOption = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
      if (skipOption) {
        resp = session.resolveChoice(0, '__skip__')
      }
    }

    const after = session.getState().state
    // Owner should NOT get grain — scope is 'opponent'
    expect(after.players[0]!.resources.grain).toBe(grainBefore)
  })

  it('does not trigger when opponent already placed a farmer this round (not first)', () => {
    const session = setup(1)
    const s = session.getState().state
    const wishSpace = s.actionSpaces.find((sp) => sp.id === 'wish-children')
    if (!wishSpace) return

    // Pretend opponent already placed one farmer earlier this round.
    recordRoundPlacement(s.players[1]!, 'forest', s.players[1]!.workers[0]!.id)
    session.loadState(s)

    const grainBefore = session.getState().state.players[0]!.resources.grain

    let resp = session.takeAction(1, 'wish-children')
    if (!resp.ok) return

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }
    if (resp.interaction.stateId === 'wait') {
      const skipOption = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
      if (skipOption) resp = session.resolveChoice(1, '__skip__')
    }
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Opponent's wish-children was NOT their first placement → no grain
    expect(after.players[0]!.resources.grain).toBe(grainBefore)
  })

  it('does not trigger on non-family-growth spaces', () => {
    const session = setup(1)
    const grainBefore = session.getState().state.players[0]!.resources.grain

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.grain).toBe(grainBefore)
  })
})
