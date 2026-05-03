import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A30_BakingSheet } from '../../shared/cards/A/A30_BakingSheet'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('A30_BakingSheet prerequisite', () => {
  it('blocks when player has at least one grain field', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    expect(meetsCardPrerequisites(player, A30_BakingSheet, state.round, state)).toBe(false)
  })

  it('allows when no field carries grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = []
    expect(meetsCardPrerequisites(player, A30_BakingSheet, state.round, state)).toBe(true)
  })
})
