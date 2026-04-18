import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { computeScores } from '../../shared/logic/scoring'
import { getFenceCount, getPalisadeCount } from '../../shared/actions/effects/fencing'

import '../../shared/cards/B/B30_WoodPalisades'

const CARD_ID = 'B30_WoodPalisades'

// Tile (0,0) is free by default (starter rooms are at col 0, rows 2 & 1).
const tile00Edges = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']

const setup = (overrides: { withCard?: boolean; wood?: number } = {}) => {
  const session = new GameSession()
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
  return summary.categories.find((c) => c.key === 'cardStateBonusVp')?.total ?? 0
}

describe('B30 Wood Palisades — session', () => {
  it('places 4 palisades, costs 8 wood, scores +4 VP', () => {
    const session = setup({ wood: 8 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'fence', {
      edges: [],
      palisadeEdges: tile00Edges,
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.pastures).toHaveLength(1)
    expect(getFenceCount(player)).toBe(0)
    expect(getPalisadeCount(player)).toBe(4)
    expect(bonusVpFor(session)).toBe(4)
  })

  it('mixes 2 fence + 2 palisade, costs 6 wood, scores +2 VP', () => {
    const session = setup({ wood: 6 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'fence', {
      edges: ['H-0-0', 'H-1-0'],
      palisadeEdges: ['V-0-0', 'V-0-1'],
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

    resp = session.commitFarmChoice(0, 'fence', {
      edges: [],
      palisadeEdges: tile00Edges,
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('PALISADES_NOT_UNLOCKED')
  })
})
