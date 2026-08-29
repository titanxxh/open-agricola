import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { E001_PoleBarns } from '../../shared/cards/E/E001_PoleBarns'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import type { FenceSegment } from '../../shared/contract/types'

describe('E001_PoleBarns prerequisite', () => {
  it('blocks when player has fewer than 15 fence segments on board', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = []
    expect(meetsCardPrerequisites(player, E001_PoleBarns, state.round, state)).toBe(false)
  })

  it('does not count Wood Palisades toward the 15-fence prerequisite', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = [
      ...Array.from({ length: 14 }, (_, i): FenceSegment => ({
        edge: `H-0-${i}`,
        type: 'fence',
      })),
      { edge: 'V-0-0', type: 'palisade' },
    ]
    expect(meetsCardPrerequisites(player, E001_PoleBarns, state.round, state)).toBe(false)
  })

  it('allows when player has 15 fence segments on board', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = Array.from({ length: 15 }, (_, i): FenceSegment => ({
      edge: `H-0-${i}`,
      type: 'fence',
    }))
    expect(meetsCardPrerequisites(player, E001_PoleBarns, state.round, state)).toBe(true)
  })
})
