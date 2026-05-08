import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getAdHocAction } from '../../shared/actions/helpers/ad-hoc-action-registry'

import '../../shared/cards/E/E83_ShepherdsWhistle'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'E83_ShepherdsWhistle'

const setupSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  return { session, state }
}

describe('E83_ShepherdsWhistle session — reorganize fallback', () => {
  it('returns gain sheep flow when player has at least 1 empty unfenced stable', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // One unfenced stable tile, no animal in it.
    player.stableTiles = [{ row: 0, col: 0 }]
    player.stableAnimals = {}
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onEndHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ sheep: 1 })
  })

  it('returns optional reorganize+recheck seq when all unfenced stables are occupied', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // Single unfenced stable, occupied by a sheep.
    player.stableTiles = [{ row: 0, col: 0 }]
    player.stableAnimals = { '0-0': 'sheep' }
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onEndHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.optional).toBe(true)
    expect(seq.children.length).toBe(2)
    const reorgChild = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(reorgChild.actionId).toBe('anytime-reorg')
    const checkChild = seq.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(checkChild.actionId).toBe('card_E83_ShepherdsWhistle_post-reorg-check')
  })

  it('does NOT trigger when player has no unfenced stables at all', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = []
    player.stableAnimals = {}
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onEndHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('post-reorg-check leaf gains sheep when an empty unfenced stable exists after reorg', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // Two unfenced stables — one now empty after the simulated reorg.
    player.stableTiles = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]
    player.stableAnimals = { '0-0': 'sheep', '0-1': null }
    session.loadState(state)

    const adHoc = getAdHocAction('card_E83_ShepherdsWhistle_post-reorg-check')!
    const result = adHoc.execute({
      state,
      player,
      params: undefined,
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0])

    expect(result.type).toBe('flow')
    const r = result as Extract<typeof result, { type: 'flow' }>
    const leaf = r.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ sheep: 1 })
  })

  it('post-reorg-check leaf is no-op when reorg did not free any unfenced stable', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = [{ row: 0, col: 0 }]
    player.stableAnimals = { '0-0': 'sheep' }
    session.loadState(state)

    const adHoc = getAdHocAction('card_E83_ShepherdsWhistle_post-reorg-check')!
    const result = adHoc.execute({
      state,
      player,
      params: undefined,
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0])

    expect(result.type).toBe('ok')
  })
})
