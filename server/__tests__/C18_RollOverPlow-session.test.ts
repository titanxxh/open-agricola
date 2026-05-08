import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/C/C18_RollOverPlow'
import type { AnytimeAction } from '../../shared/contract/types';

const CARD_ID = 'C18_RollOverPlow'

describe('C18_RollOverPlow session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // 3 planted fields
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 1, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]

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

  it('available with 3+ planted fields', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('C18-roll-over-plow-anytime')
  })

  it('select field 0-2 discards grain and then plow interaction starts', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Take the anytime action
    let resp = session.takeAnytimeAction(0, 'C18-roll-over-plow-anytime')
    expect(resp.ok).toBe(true)

    // Should be in selection choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)

    // Select field 0-2 (grain with remaining 3)
    resp = session.resolveChoice(0, '0-2')
    expect(resp.ok).toBe(true)

    // After selection resolves, plow action should start
    // Plow shows a farm interaction for tile selection
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow choice')
    expect(resp.interaction.promptKey).toBe('ui.interactionPlowSelect')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)

    // Verify the field was discarded
    const p = resp.state.players[0]!
    const f = p.fields.find(f => f.row === 0 && f.col === 2)!
    expect(f.stacks[0]?.kind ?? null).toBeNull()
    expect(f.stacks[0]?.remaining ?? 0).toBe(0)

    // Commit the plow choice
    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.resolveChoice(0, 'confirm', { tile })
    expect(resp.ok).toBe(true)

    // Should have gained a new field from plowing
    expect(resp.state.players[0]!.fields.length).toBe(4)
  })

  it('NOT available with < 3 planted fields', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Only 2 planted fields
    player.fields = [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]

    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('C18-roll-over-plow-anytime')
  })
})
