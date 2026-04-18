import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/A/A68_AsparagusGift'
import '../../shared/cards/B/B30_WoodPalisades'

const CARD_ID = 'A68_AsparagusGift'
const B30 = 'B30_WoodPalisades'

// Tile (0,0) is free by default
const tile00Fences = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const tile00Palisades = tile00Fences

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
  it('does not award vegetable when palisade-only build of 4 happens at round 3', () => {
    // fencesBuilt measured via getFenceCount delta. Palisade-only → delta is 0.
    const session = setup({ withB30: true, wood: 8, round: 3 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'fence', {
      edges: [],
      palisadeEdges: tile00Palisades,
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

    resp = session.commitFarmChoice(0, 'fence', {
      edges: tile00Fences,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.vegetable).toBe(1)
  })
})
