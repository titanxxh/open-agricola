import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/D/D071_Changeover'
import type { ActionChoiceOption, AnytimeAction } from '../../shared/contract/types'

describe('D071_Changeover session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2
    state.roundPhase = 'work'
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push('D071_Changeover')

    // One eligible field (remaining === 1), one not eligible (remaining === 2)
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },    // eligible
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] }, // not eligible
    ]
    player.resources.grain = 2 // for sow action

    session.loadState(state)
    return session
  }

  /** Take farmland action to enter active interaction */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('available when field has exactly 1 remaining', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('D71-changeover-anytime')
  })

  it('select field 0-2 discards crop, then sow interaction follows', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Take the anytime action
    let resp = session.takeAnytimeAction(0, 'D71-changeover-anytime')
    expect(resp.ok).toBe(true)

    // Should be in selection choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')

    // Select field 0-2 (grain with remaining 1)
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(resp.ok).toBe(true)

    // After selection, verify the field was discarded
    const p = resp.state.players[0]!
    const f = p.fields.find(f => f.row === 0 && f.col === 2)!
    expect(f.stacks[0]?.kind ?? null).toBeNull()
    expect(f.stacks[0]?.remaining ?? 0).toBe(0)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional sow prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.options?.map((o) => o.value)).toContain('__skip__')

    const acceptOption = resp.interaction.options?.find((o: ActionChoiceOption) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    resp = session.resolveChoice(0, acceptOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionSowSelect')
    expect(resp.interaction.stateId === 'wait'
      ? resp.interaction.options?.map((option) => option.value)
      : [],
    ).toEqual(['confirm'])

    const rejected = session.commitSelectionChoice(0, { cancel: true })
    expect(rejected.ok).toBe(false)
    expect(rejected.ok ? '' : rejected.error).toBe('action cancel is not allowed')
    expect(rejected.interaction.stateId === 'wait' ? rejected.interaction.promptKey : undefined)
      .toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    const sownField = resp.state.players[0]!.fields.find(f => f.row === 0 && f.col === 2)!
    expect(sownField.stacks[0]?.kind).toBe('grain')
    expect(sownField.stacks[0]?.remaining ?? 0).toBe(3)
  })

  it('NOT available when no field has exactly 1 remaining', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2
    state.roundPhase = 'work'
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push('D071_Changeover')

    // No field with remaining === 1
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D71-changeover-anytime')
  })
})
