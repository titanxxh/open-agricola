import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../../session/state-bootstrap'
import {
  getRoundPersonPlacementDetails,
  getRoundPersonPlacementOrder,
  recordRoundPlacement,
} from '../round-placement'

describe('round person placement history', () => {
  it('excludes relocations while retaining temporary and recalled-worker placements', () => {
    const player = createInitialState(18, { playerCount: 2 }).players[0]!

    recordRoundPlacement(player, 'forest', '1')
    recordRoundPlacement(player, 'grain-seeds', '1', true)
    recordRoundPlacement(player, 'clay-pit', 'temporary-3')
    recordRoundPlacement(player, 'farmland', '1')

    expect(getRoundPersonPlacementDetails(player)).toEqual([
      { spaceId: 'forest', workerId: '1' },
      { spaceId: 'clay-pit', workerId: 'temporary-3' },
      { spaceId: 'farmland', workerId: '1' },
    ])
    expect(getRoundPersonPlacementOrder(player)).toEqual(['forest', 'clay-pit', 'farmland'])
  })
})
