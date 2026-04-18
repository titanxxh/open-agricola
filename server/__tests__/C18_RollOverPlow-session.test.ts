import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/C/C18_RollOverPlow'

describe('C18_RollOverPlow session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const player = state.players[0]!
    player.minorPlayed.push('C18_RollOverPlow')

    // 3 planted fields
    player.fields = [
      { row: 0, col: 2, crop: 'grain', remaining: 3 },
      { row: 0, col: 3, crop: 'vegetable', remaining: 2 },
      { row: 1, col: 2, crop: 'grain', remaining: 1 },
    ]

    session.loadState(state)
    return session
  }

  /** Take farmland action to enter active interaction */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')
    return resp
  }

  it('available with 3+ planted fields', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('C18-roll-over-plow-anytime')
  })

  it('select field 0-2 discards grain and then plow interaction starts', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Take the anytime action
    let resp = session.takeAnytimeAction(0, 'C18-roll-over-plow-anytime')
    expect(resp.ok).toBe(true)

    // Should be in field-select choice
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') throw new Error('expected field-select choice')

    // Select field 0-2 (grain with remaining 3)
    resp = session.resolveChoice(0, '0-2')
    expect(resp.ok).toBe(true)

    // After field-select resolves, plow action should start
    // Plow shows a farm interaction for tile selection
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') throw new Error('expected plow choice')
    expect((resp.pending as any).promptKey).toBe('ui.interactionPlowSelect')
    expect(resp.interaction.stateId).toBe('farmSelect')

    // Verify the field was discarded
    const p = resp.state.players[0]!
    const f = p.fields.find(f => f.row === 0 && f.col === 2)!
    expect(f.crop).toBeNull()
    expect(f.remaining).toBe(0)

    // Commit the plow choice
    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.commitFarmChoice(0, 'plow', { tile })
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
    player.minorPlayed.push('C18_RollOverPlow')

    // Only 2 planted fields
    player.fields = [
      { row: 0, col: 2, crop: 'grain', remaining: 3 },
      { row: 0, col: 3, crop: 'vegetable', remaining: 2 },
    ]

    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('C18-roll-over-plow-anytime')
  })
})
