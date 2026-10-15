import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../../session/state-bootstrap'
import type { GameEvent } from '../../../contract/events'
import { getActionNewlyUsedTiles } from '../farmyard-events'

const player = createInitialState(42, { playerCount: 2 }).players[0]!
const used: GameEvent = {
  schemaVersion: 1, id: 'used', seq: 1, round: 1, phase: 'work', visibility: 'public',
  type: 'farm.spacesUsed', sourceCardId: 'M064_FamilyBurialPlot',
  newlyUsedTiles: [{ playerId: player.id, row: 1, col: 3 }, { playerId: 'other', row: 0, col: 4 }],
}

describe('committed host farmyard usage', () => {
  it('deduplicates owned coordinates and returns copies', () => {
    const result = getActionNewlyUsedTiles({ player, actionEvents: [used, used] })
    expect(result).toEqual([{ playerId: player.id, row: 1, col: 3 }])
    result[0]!.row = 2
    expect(used.newlyUsedTiles[0]).toEqual({ playerId: player.id, row: 1, col: 3 })
  })

  it('does not consume uncommitted draft usage', () => {
    expect(getActionNewlyUsedTiles({ player, actionEvents: [{ type: 'farm.spacesUsed', newlyUsedTiles: used.newlyUsedTiles }] })).toEqual([])
  })

  it('does not borrow another host event from the enclosing transaction', () => {
    const context = { player, transactionEvents: [used], actionEvents: [] }
    expect(getActionNewlyUsedTiles(context)).toEqual([])
    expect(getActionNewlyUsedTiles({ ...context, actionEvents: undefined })).toEqual([])
  })
})
