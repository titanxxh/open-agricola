import { describe, expect, it } from 'vitest'
import type { GameState, WorkerRef } from '../../../contract/types'
import { countPeopleOnSpace } from '../space-occupancy'
import { mkActionSpace } from '../../__tests__/fixtures'

const mkState = (takenBy: WorkerRef[]): GameState => ({
  actionSpaces: [mkActionSpace({ id: 'farmland', takenBy })],
  players: [],
  round: 1, roundPhase: 'work', currentPlayerIndex: 0,
  log: [], roundStartSnapshot: null, roundActionOrder: [],
  gameSeed: 0, availableMajorImprovements: [], futureMeeples: [],
  pendingFutureMeeples: [], gameOver: false, workPhaseObtainedResources: {},
} as unknown as GameState)

describe('countPeopleOnSpace', () => {
  it('returns 0 for empty space', () => {
    expect(countPeopleOnSpace(mkState([]), 'farmland')).toBe(0)
  })

  it('returns 1 for single occupant', () => {
    expect(countPeopleOnSpace(mkState([{ playerId: 'p1', workerId: '1' }]), 'farmland')).toBe(1)
  })

  it('returns 2 for two occupants (e.g. parent + newborn on FG space)', () => {
    expect(countPeopleOnSpace(mkState([
      { playerId: 'p1', workerId: '1' },
      { playerId: 'p1', workerId: '3' },
    ]), 'farmland')).toBe(2)
  })

  it('returns 2 for two occupants from different players (canUseOccupied path)', () => {
    expect(countPeopleOnSpace(mkState([
      { playerId: 'p1', workerId: '1' },
      { playerId: 'p2', workerId: '1' },
    ]), 'farmland')).toBe(2)
  })

  it('returns 0 when spaceId is unknown', () => {
    expect(countPeopleOnSpace(mkState([{ playerId: 'p1', workerId: '1' }]), 'no-such-space')).toBe(0)
  })
})
