import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A022_Telegram } from '../../shared/cards/A/A022_Telegram'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { maxFences } from '../../shared/actions/effects/fencing'
import type { FenceSegment } from '../../shared/contract/types'

describe('A022_Telegram prerequisite', () => {
  it('blocks when player has placed all fences (no fences in supply)', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = Array.from({ length: maxFences }, (_, i): FenceSegment => ({
      edge: `H-0-${i}`,
      type: 'fence',
    }))
    expect(meetsCardPrerequisites(player, A022_Telegram, state.round, state)).toBe(false)
  })

  it('allows when at least one fence remains in supply', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = []
    expect(meetsCardPrerequisites(player, A022_Telegram, state.round, state)).toBe(true)
  })

  it('blocks when all unbuilt ordinary fences are held on E74', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = []
    player.minorPlayed.push('E074_AshTrees')
    player.cardStates = { E074_AshTrees: { counters: { fences: maxFences } } }
    expect(meetsCardPrerequisites(player, A022_Telegram, state.round, state)).toBe(false)
  })

  it('blocks when supply fence tokens have all been consumed', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = []
    player.supplyTokensConsumed = { fence: maxFences }
    expect(meetsCardPrerequisites(player, A022_Telegram, state.round, state)).toBe(false)
  })
})
