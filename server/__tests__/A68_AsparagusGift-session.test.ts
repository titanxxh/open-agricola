import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { A068_AsparagusGift } from '../../shared/cards/A/A068_AsparagusGift'
import '../../shared/cards/B/B030_WoodPalisades'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const CARD_ID = 'A068_AsparagusGift'
const B30 = 'B030_WoodPalisades'

// Tile (0,0) edges
const tile00Fences = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
// For palisades, only border edges of tile (0,0) are valid: H-0-0 (top) and V-0-0 (left).
// Complete the enclosure with internal fences: H-1-0, V-0-1.
const tile00BorderPalisades = ['H-0-0', 'V-0-0']
const tile00InternalFences = ['H-1-0', 'V-0-1']

const setup = (opts: { withB30?: boolean; wood: number; round?: number }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = opts.round ?? 3

  const player = state.players[0]!
  player.resources = { ...player.resources, wood: opts.wood }
  player.minorPlayed = [...player.minorPlayed, CARD_ID]
  player.minorPlayed.push(CARD_ID)
  if (opts.withB30) {
    player.minorPlayed.push(B30)
  }

  session.loadState(state)
  return session
}

describe('A68 Asparagus Gift — session', () => {
  it('does not award vegetable when palisade-dominated build at round 3 has fewer real fences than round', () => {
    // fencesBuilt measured via getFenceCount (regular fences only). Delta must be < round.
    // 2 palisades (border: H-0-0, V-0-0) + 2 real fences (internal: H-1-0, V-0-1).
    // fencesBuilt = 2, round = 3 → 2 < 3 → no vegetable.
    // Cost: 2 palisades × 2 + 2 fences × 1 = 6 wood.
    const session = setup({ withB30: true, wood: 6, round: 3 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: tile00InternalFences,
      palisadeEdges: tile00BorderPalisades,
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.vegetable).toBe(0)
  })

  it('awards 1 vegetable when building 4 real fences at round 3', () => {
    const session = setup({ wood: 4, round: 3 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: tile00Fences,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.vegetable).toBe(1)
  })

  describe('prerequisite "1 Unplanted Field"', () => {
    it('blocks when player has no empty fields', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = []
      expect(meetsCardPrerequisites(player, A068_AsparagusGift, state.round, state)).toBe(false)
    })

    it('allows when player has at least one empty field', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      expect(meetsCardPrerequisites(player, A068_AsparagusGift, state.round, state)).toBe(true)
    })
  })
})
