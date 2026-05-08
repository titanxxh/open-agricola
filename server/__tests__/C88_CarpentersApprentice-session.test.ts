import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { PlayerState, GameState } from '../../shared/contract/types'

import '../../shared/cards/C/C88_CarpentersApprentice'
import '../../shared/cards/B/B30_WoodPalisades'

const stablesDiscount = (player: PlayerState): number => {
  const listeners = getRegisteredCardListeners().filter((l) =>
    l.cardIds?.includes('C88_CarpentersApprentice'),
  )
  const stableListener = listeners.find(
    (l) =>
      l.actions?.includes('stables') &&
      l.phases?.includes('computeCosts'),
  )
  if (!stableListener) return 0
  const ctx = {
    state: {} as GameState,
    player,
    space: {} as never,
    actionId: 'stables',
    phase: 'computeCosts',
  } as unknown as CardListenerContext
  const result = stableListener.handler(ctx)
  if (!result || typeof result !== 'object') return 0
  const costs = (result as { costs?: { wood?: number } }).costs
  return costs?.wood ?? 0
}

describe('C88 Carpenter\'s Apprentice — session w/ palisades', () => {
  it('freeFences discount fences only; palisades still cost full wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // No existing fences → freeFences = 15
    // 2 fence edges × 1 wood = 2, minus freeFences (2 used) → 0
    // 2 palisade edges × 2 wood = 4
    // total = 4 wood
    player.resources.wood = 4
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.minorPlayed.push('B30_WoodPalisades')

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Fence tile (0,0). 2 fences (internal) + 2 palisades (border).
    // Palisades must be on border: H-0-0 (top), V-0-0 (left).
    // Fences on internal: H-1-0, V-0-1.
    resp = session.resolveChoice(0, 'confirm', {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    const result = resp.state.players[0]!
    // Wood fully consumed
    expect(result.resources.wood).toBe(0)
    expect(result.pastures).toHaveLength(1)
  })

  it('rejects insufficient wood when palisades dominate (no double-discount)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // Only 3 wood — not enough for 4-wood palisade+fence build (2 palisades @ 2 each).
    player.resources.wood = 3
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.minorPlayed.push('B30_WoodPalisades')

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Same layout as above but insufficient wood.
    resp = session.resolveChoice(0, 'confirm', {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })

    expect(resp.ok).toBe(false)
  })

  describe('stables-cost listener cap (3rd & 4th stables only)', () => {
    const makePlayer = (stables: number): PlayerState => {
      const session = new GameSession()
      const state = session.getState().state
      const p = state.players[0]!
      p.occupationPlayed.push('C88_CarpentersApprentice')
      p.stableTiles = Array.from({ length: stables }, (_, i) => ({ row: 0, col: i }))
      return p
    }

    it('0 stables built → no discount on next stable (1st)', () => {
      expect(stablesDiscount(makePlayer(0))).toBe(0)
    })

    it('1 stable built → no discount on next stable (2nd)', () => {
      expect(stablesDiscount(makePlayer(1))).toBe(0)
    })

    it('2 stables built → -1 wood on next stable (3rd)', () => {
      expect(stablesDiscount(makePlayer(2))).toBe(-1)
    })

    it('3 stables built → -1 wood on next stable (4th)', () => {
      expect(stablesDiscount(makePlayer(3))).toBe(-1)
    })

    it('4 stables built → no further discount (cap)', () => {
      expect(stablesDiscount(makePlayer(4))).toBe(0)
    })
  })
})
