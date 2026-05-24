import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A22_Telegram } from '../../shared/cards-display/A/A22_Telegram'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { maxFences } from '../../shared/actions/effects/fencing'
import type { FenceSegment } from '../../shared/contract/types'

describe('A22_Telegram prerequisite', () => {
  it('blocks when player has placed all fences (no fences in supply)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = Array.from({ length: maxFences }, (_, i): FenceSegment => ({
      edge: `H-0-${i}`,
      type: 'fence',
    }))
    expect(meetsCardPrerequisites(player, A22_Telegram, state.round, state)).toBe(false)
  })

  it('allows when at least one fence remains in supply', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = []
    expect(meetsCardPrerequisites(player, A22_Telegram, state.round, state)).toBe(true)
  })

  it('blocks when all unbuilt ordinary fences are held on E74', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = []
    player.cardStates = { E74_AshTrees: { counters: { fences: maxFences } } }
    expect(meetsCardPrerequisites(player, A22_Telegram, state.round, state)).toBe(false)
  })

  it('blocks when supply fence tokens have all been consumed', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.fenceSegments = []
    player.supplyTokensConsumed = { fence: maxFences }
    expect(meetsCardPrerequisites(player, A22_Telegram, state.round, state)).toBe(false)
  })
})
