import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/A/A71_ClearingSpade'
import type { AnytimeAction } from '../../shared/contract/types';

describe('A71_ClearingSpade session', () => {
  const setup = (fields?: { row: number; col: number; crop: string | null; remaining: number }[]) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('A71_ClearingSpade')
    session.loadState(state)
    session.devPlayCard(0, 'A71_ClearingSpade')

    // Set up fields
    const s2 = session.getState().state
    const p = s2.players[0]!
    p.fields = fields ?? [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },   // source: has grain >= 2
      { row: 0, col: 3, stacks: [] },       // target: empty plowed field
      { row: 1, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] }, // not eligible (only 1)
    ]
    session.loadState(s2)
    return session
  }

  /** Enter an active interaction so we can test anytime actions */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('anytime action available when source field (>=2 crops) AND empty field exist', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('A71-clearing-spade-anytime')
  })

  it('full flow: select source field then target field, crop is moved', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Step 1: take anytime action — first selection choice
    let resp = session.takeAnytimeAction(0, 'A71-clearing-spade-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected choice')

    // Select the source field (0-2) which has grain remaining=3
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(resp.ok).toBe(true)

    // Step 2: second selection choice for target
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected choice')

    // Select the target field (0-3) which is empty
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })
    expect(resp.ok).toBe(true)

    // Verify results
    const player = resp.state.players[0]!
    const sourceField = player.fields.find(f => f.row === 0 && f.col === 2)!
    const targetField = player.fields.find(f => f.row === 0 && f.col === 3)!

    // Source: was grain remaining=3, now remaining=2
    expect(sourceField.stacks[0]?.kind).toBe('grain')
    expect(sourceField.stacks[0]?.remaining ?? 0).toBe(2)

    // Target: was empty, now has grain remaining=1
    expect(targetField.stacks[0]?.kind).toBe('grain')
    expect(targetField.stacks[0]?.remaining ?? 0).toBe(1)
  })

  it('NOT available when no field has >= 2 crops', () => {
    const session = setup([
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },   // only 1 crop
      { row: 0, col: 3, stacks: [] },       // empty field
    ])
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A71-clearing-spade-anytime')
  })

  it('NOT available when no empty plowed fields exist', () => {
    const session = setup([
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },     // source OK
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] }, // not empty
    ])
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A71-clearing-spade-anytime')
  })

  it('works with vegetable fields as source', () => {
    const session = setup([
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] }, // source
      { row: 0, col: 3, stacks: [] },         // target
    ])
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'A71-clearing-spade-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Select source
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Select target
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    const sourceField = player.fields.find(f => f.row === 0 && f.col === 2)!
    const targetField = player.fields.find(f => f.row === 0 && f.col === 3)!

    expect(sourceField.stacks[0]?.kind).toBe('vegetable')
    expect(sourceField.stacks[0]?.remaining ?? 0).toBe(1)
    expect(targetField.stacks[0]?.kind).toBe('vegetable')
    expect(targetField.stacks[0]?.remaining ?? 0).toBe(1)
  })
})
