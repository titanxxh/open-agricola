import { describe, expect, it } from 'vitest'
import type { FenceSegment, PlayerState } from '../../contract/types'
import {
  MAX_ORDINARY_FENCE_PIECES,
  getAvailableOwnOrdinaryFenceCount,
  getOwnOrdinaryFenceCount,
  isOwnOrdinaryFenceSegment,
} from '../fence-segments'
import { getOwnOrdinaryFenceReserveCount } from '../supply-tokens'

const makePlayer = (fenceSegments: FenceSegment[]): PlayerState =>
  ({
    id: 'p1',
    fenceSegments,
  }) as unknown as PlayerState

describe('fence segment helpers', () => {
  it('counts missing source ordinary fence as own ordinary', () => {
    expect(isOwnOrdinaryFenceSegment({ edge: 'H-0-0', type: 'fence' }, 'p1')).toBe(true)
  })

  it('counts own source with same owner', () => {
    expect(
      isOwnOrdinaryFenceSegment(
        { edge: 'H-0-0', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
        'p1',
      ),
    ).toBe(true)
  })

  it('does not count borrowed ordinary as own', () => {
    expect(
      isOwnOrdinaryFenceSegment(
        { edge: 'H-0-0', type: 'fence', source: { kind: 'borrowed', ownerPlayerId: 'p2' } },
        'p1',
      ),
    ).toBe(false)
  })

  it('does not count own palisade', () => {
    expect(
      isOwnOrdinaryFenceSegment(
        { edge: 'H-0-0', type: 'palisade', source: { kind: 'own', ownerPlayerId: 'p1' } },
        'p1',
      ),
    ).toBe(false)
  })

  it('ignores borrowed and palisade segments when counting availability', () => {
    const player = makePlayer([
      { edge: 'H-0-0', type: 'fence' },
      { edge: 'H-0-1', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
      { edge: 'H-0-2', type: 'fence', source: { kind: 'borrowed', ownerPlayerId: 'p2' } },
      { edge: 'H-0-3', type: 'palisade', source: { kind: 'own', ownerPlayerId: 'p1' } },
    ])

    expect(getOwnOrdinaryFenceCount(player)).toBe(2)
    expect(getAvailableOwnOrdinaryFenceCount(player)).toBe(MAX_ORDINARY_FENCE_PIECES - 2)
  })

  it('subtracts consumed fence supply tokens from available own ordinary count', () => {
    const player = makePlayer([
      { edge: 'H-0-0', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
      { edge: 'H-0-1', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
    ])
    player.supplyTokensConsumed = { fence: 3 }

    expect(getAvailableOwnOrdinaryFenceCount(player)).toBe(10)
  })

  it('excludes consumed and E74-held ordinary fences from reserve count', () => {
    const player = makePlayer([
      { edge: 'H-0-0', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
      { edge: 'H-0-1', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
    ])
    player.cardStates = { E074_AshTrees: { counters: { fences: 5 } } }
    player.supplyTokensConsumed = { fence: 1 }

    expect(getOwnOrdinaryFenceReserveCount(player)).toBe(7)
  })
})
