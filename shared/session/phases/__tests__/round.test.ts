import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types.ts'
import { nextSeatedPlayerIdx, computeStartPlayerIdx } from '../round.ts'

const makePlayer = (id: string, startPlayer = false, activeWorkers = 1): PlayerState =>
  ({
    id,
    name: id,
    startPlayer,
    workers: Array.from({ length: activeWorkers }, (_, i) => ({
      id: String(i + 1),
      isActive: true,
      isNewborn: false,
    })),
    // Played-card arrays are required: `nextSeatedPlayerIdx` now consults
    // `hasPendingExtraTurn`, which iterates these. A bare 0-worker player with
    // no cards contributes no extra turn, so the seat-walk still skips it.
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    resources: { food: 0 },
    cardStates: {},
  } as unknown as PlayerState)

const makeState = (players: PlayerState[]): GameState =>
  ({ players, actionSpaces: [] } as unknown as GameState)

describe('round phase helpers', () => {
  it('computeStartPlayerIdx returns 0 when no startPlayer flag set', () => {
    const state = makeState([makePlayer('p0'), makePlayer('p1')])
    expect(computeStartPlayerIdx(state)).toBe(0)
  })

  it('computeStartPlayerIdx finds the flagged seat', () => {
    const state = makeState([makePlayer('p0'), makePlayer('p1', true)])
    expect(computeStartPlayerIdx(state)).toBe(1)
  })

  it('nextSeatedPlayerIdx returns current when no other player has workers', () => {
    const players = [makePlayer('p0', false, 1), makePlayer('p1', false, 0)]
    const state = makeState(players)
    expect(nextSeatedPlayerIdx(state, players, 0)).toBe(0)
  })

  it('nextSeatedPlayerIdx wraps to next seated worker', () => {
    const players = [
      makePlayer('p0', false, 0),
      makePlayer('p1', false, 1),
      makePlayer('p2', false, 1),
    ]
    const state = makeState(players)
    expect(nextSeatedPlayerIdx(state, players, 0)).toBe(1)
  })

  it('nextSeatedPlayerIdx walks backwards and skips empty seats when reversed', () => {
    const players = [
      makePlayer('p0', false, 1),
      makePlayer('p1', false, 0),
      makePlayer('p2', false, 1),
      makePlayer('p3', false, 1),
    ]
    const state = makeState(players)
    expect(nextSeatedPlayerIdx(state, players, 2, -1)).toBe(0)
    expect(nextSeatedPlayerIdx(state, players, 0, -1)).toBe(3)
    expect(nextSeatedPlayerIdx(state, players, 3, -1)).toBe(2)
  })

  it('nextSeatedPlayerIdx returns current when walking backwards finds nobody else', () => {
    const players = [makePlayer('p0', false, 0), makePlayer('p1', false, 1)]
    const state = makeState(players)
    expect(nextSeatedPlayerIdx(state, players, 1, -1)).toBe(1)
  })
})
