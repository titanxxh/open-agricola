import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B45_StrawberryPatch } from '../../shared/cards/B/B45_StrawberryPatch'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('B45_StrawberryPatch prerequisite', () => {
  it('blocks when player has fewer than 2 vegetable fields', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
    expect(meetsCardPrerequisites(player, B45_StrawberryPatch, state.round, state)).toBe(false)
  })

  it('allows when player has 2 vegetable fields', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    expect(meetsCardPrerequisites(player, B45_StrawberryPatch, state.round, state)).toBe(true)
  })
})
