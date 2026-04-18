import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/D/D71_Changeover'

describe('D71_Changeover session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const player = state.players[0]!
    player.minorPlayed.push('D71_Changeover')

    // One eligible field (remaining === 1), one not eligible (remaining === 2)
    player.fields = [
      { row: 0, col: 2, crop: 'grain', remaining: 1 },    // eligible
      { row: 0, col: 3, crop: 'vegetable', remaining: 2 }, // not eligible
    ]
    player.resources.grain = 2 // for sow action

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

  it('available when field has exactly 1 remaining', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('D71-changeover-anytime')
  })

  it('select field 0-2 discards crop, then sow interaction follows', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Take the anytime action
    let resp = session.takeAnytimeAction(0, 'D71-changeover-anytime')
    expect(resp.ok).toBe(true)

    // Should be in field-select choice
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') throw new Error('expected field-select choice')

    // Select field 0-2 (grain with remaining 1)
    resp = session.resolveChoice(0, '0-2')
    expect(resp.ok).toBe(true)

    // After field-select, verify the field was discarded
    const p = resp.state.players[0]!
    const f = p.fields.find(f => f.row === 0 && f.col === 2)!
    expect(f.crop).toBeNull()
    expect(f.remaining).toBe(0)

    // The sow action is optional. If it produces a choice, we should see sow select.
    // The player has grain=2 and there's an empty field (0-2 was just cleared),
    // so sow should be offered.
    if (resp.pending.type === 'choice') {
      // Could be sow select or an optional skip
      const promptKey = (resp.pending as any).promptKey
      if (promptKey === 'ui.interactionOptionalAction') {
        // Accept the optional sow
        const acceptOption = resp.pending.options.find((o: any) => o.value !== '__skip__')
        if (acceptOption) {
          resp = session.resolveChoice(0, acceptOption.value)
        }
      }
      if (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionSowSelect') {
        expect(resp.interaction.stateId).toBe('farmSelect')
        // Sow grain into the empty field 0-2
        resp = session.commitFarmChoice(0, 'sow', {
          crops: [{ row: 0, col: 2, crop: 'grain' }],
        })
        expect(resp.ok).toBe(true)
        // Grain deducted: 2 - 1 = 1
        expect(resp.state.players[0]!.resources.grain).toBe(1)
        // Field should now have grain sown
        const sownField = resp.state.players[0]!.fields.find(f => f.row === 0 && f.col === 2)!
        expect(sownField.crop).toBe('grain')
        expect(sownField.remaining).toBe(3)
      }
    }
  })

  it('NOT available when no field has exactly 1 remaining', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const player = state.players[0]!
    player.minorPlayed.push('D71_Changeover')

    // No field with remaining === 1
    player.fields = [
      { row: 0, col: 2, crop: 'grain', remaining: 3 },
      { row: 0, col: 3, crop: 'vegetable', remaining: 2 },
    ]

    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('D71-changeover-anytime')
  })
})
