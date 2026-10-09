import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeScores } from '../../shared/domain/scoring'
import { getFenceCount, getPalisadeCount } from '../../shared/actions/effects/fencing'

import '../../shared/cards/B/B030_WoodPalisades'

const CARD_ID = 'B030_WoodPalisades'

// Tile (0,0) corner edges:
// H-0-0 = top border (border), H-1-0 = bottom of tile (internal)
// V-0-0 = left border (border), V-0-1 = right of tile (internal)
const tile00Fences = ['H-1-0', 'V-0-1']     // internal edges
const tile00Palisades = ['H-0-0', 'V-0-0']  // border edges

const setup = (overrides: { withCard?: boolean; wood?: number } = {}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.resources = { ...player.resources, wood: overrides.wood ?? 8 }
  if (overrides.withCard !== false) {
    player.minorPlayed.push(CARD_ID)
  }

  session.loadState(state)
  return session
}

const bonusVpFor = (session: GameSession) => {
  const state = session.getState().state
  const scores = computeScores(state)
  const summary = scores.find((s) => s.playerId === state.players[0]!.id)!
  return summary.categories.find((c) => c.key === 'cardBonusVp')?.total ?? 0
}

describe('B30 Wood Palisades — session', () => {
  it('places 2 border palisades + 2 internal fences, costs 6 wood, scores +2 VP', () => {
    const session = setup({ wood: 6 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: tile00Fences,
      palisadeEdges: tile00Palisades,
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.pastures).toHaveLength(1)
    expect(getFenceCount(player)).toBe(2)
    expect(getPalisadeCount(player)).toBe(2)
    expect(bonusVpFor(session)).toBe(2)
  })

  it('mixes 2 fence + 2 palisade, costs 6 wood, scores +2 VP', () => {
    const session = setup({ wood: 6 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: ['V-0-1', 'H-1-0'],
      palisadeEdges: ['V-0-0', 'H-0-0'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.pastures).toHaveLength(1)
    expect(getFenceCount(player)).toBe(2)
    expect(getPalisadeCount(player)).toBe(2)
    expect(bonusVpFor(session)).toBe(2)
  })

  it('rejects palisades when B30 not played', () => {
    const session = setup({ withCard: false, wood: 8 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: [],
      palisadeEdges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('PALISADES_NOT_UNLOCKED')
  })

  it('rejects palisade on internal edge even when B30 is played', () => {
    const session = setup({ wood: 6 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'V-0-0'],
      palisadeEdges: ['H-1-0'], // internal
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('PALISADE_NOT_ON_BORDER')
  })
})
