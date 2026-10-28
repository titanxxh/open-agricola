import { commitFarmOperation } from '../../../domain/farm-operations'
import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../../session/state-bootstrap'
import type { GameEvent } from '../../../contract/events'
import { getActionFarmOperations, getActionNewlyUsedTiles } from '../farmyard-events'

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
  it('keeps the original result receipt separate from nested child facts and later live geometry', () => {
    const owner = structuredClone(player)
    const outer = commitFarmOperation(owner, { kind: 'stables', standingSpecialStableCount: 0, positions: [{ row: 0, col: 1 }] })
    commitFarmOperation(owner, { kind: 'stables', standingSpecialStableCount: 0, positions: [{ row: 1, col: 3 }] })
    expect(getActionNewlyUsedTiles({ player: owner, result: { type: 'ok', farmOperations: [outer] }, actionEvents: [used] }))
      .toEqual([{ playerId: owner.id, row: 0, col: 1 }])
    expect(getActionNewlyUsedTiles({ player: owner, result: { type: 'flow', flow: { type: 'leaf', actionId: 'gain' }, farmOperations: [] }, actionEvents: [used] }))
      .toEqual([])
    expect(getActionFarmOperations({ result: { type: 'ok', farmOperations: [outer] } })?.map(operation => operation.after.stableTiles))
      .toEqual([[{ row: 0, col: 1 }]])
    expect(owner.stableTiles).toEqual([{ row: 0, col: 1 }, { row: 1, col: 3 }])
  })

  it('distinguishes missing receipts from an empty completed host receipt', () => {
    expect(getActionFarmOperations({})).toBeUndefined()
    expect(getActionFarmOperations({ result: { type: 'ok' } })).toBeUndefined()
    expect(getActionFarmOperations({ result: { type: 'ok', farmOperations: [] } })).toEqual([])
    expect(getActionFarmOperations({ result: { type: 'flow', flow: { type: 'leaf', actionId: 'gain' }, farmOperations: [] } }))
      .toEqual([])
    expect(getActionFarmOperations({ result: { type: 'fail', errorKey: 'rejected' } })).toBeUndefined()
  })
})
