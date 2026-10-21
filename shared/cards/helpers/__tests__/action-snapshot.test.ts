import { describe, it, expect } from 'vitest'
import { createInitialState } from '../../../session/state-bootstrap'
import { commitFarmOperation } from '../../../domain/farm-operations'
import { beginTurnScope, endTurnScope, recordActionSnapshot, countDistinctStablesBuiltThisTurn,
  hasBuiltStableThisTurn, roomTypeBuiltThisTurn, hasBuiltFenceThisTurn } from '../action-snapshot'
import { readTurnScopeToken } from '../turn-token'

const makePlayer = () => createInitialState(4242, { playerCount: 2 }).players[0]!
const a = { row: 0, col: 0 }
const b = { row: 0, col: 1 }
const old = { row: 2, col: 4 }
const stable = (player: ReturnType<typeof makePlayer>, positions = [a]) =>
  commitFarmOperation(player, { kind: 'stables', positions, standingSpecialStableCount: 0 })

describe('Turn construction facts', () => {
  it('keeps tokens monotonic and closes all construction facts with the scope', () => {
    const player = makePlayer()
    expect(recordActionSnapshot(player, 7)).toBe(7)
    stable(player)
    expect(hasBuiltStableThisTurn(player)).toBe(true)
    endTurnScope(player)
    expect(readTurnScopeToken(player)).toBeUndefined()
    expect(hasBuiltStableThisTurn(player)).toBe(false)
    expect(beginTurnScope(player)).toBe(8)
    expect(countDistinctStablesBuiltThisTurn(player)).toBe(0)
    endTurnScope(player)
    expect(recordActionSnapshot(player, 1)).toBe(9)
  })

  it('records actual rooms and their material without reading later renovation state', () => {
    const player = makePlayer()
    beginTurnScope(player)
    commitFarmOperation(player, { kind: 'rooms', positions: [a] })
    player.houseType = 'clay'
    expect(roomTypeBuiltThisTurn(player)).toBe('wood')
  })

  it('counts two distinct built tokens even after an old stable is returned', () => {
    const player = makePlayer()
    player.stableTiles = [old]
    beginTurnScope(player)
    stable(player)
    commitFarmOperation(player, { kind: 'remove-stables', positions: [old] })
    stable(player, [b])
    expect(countDistinctStablesBuiltThisTurn(player)).toBe(2)
    expect(player.stableTiles).toEqual([a, b])
  })

  it('reuses a returned token and counts it once while its standing ordinal can repeat', () => {
    const player = makePlayer()
    beginTurnScope(player)
    const first = stable(player)
    commitFarmOperation(player, { kind: 'remove-stables', positions: [a] })
    const second = stable(player, [b])
    expect(first).toMatchObject({ kind: 'stables', stables: [{ pieceId: 0, ordinal: 1 }] })
    expect(second).toMatchObject({ kind: 'stables', stables: [{ pieceId: 0, ordinal: 1 }] })
    expect(countDistinctStablesBuiltThisTurn(player)).toBe(1)
  })

  it('includes source-owned special stables and captures ordinals at commit time', () => {
    const player = makePlayer()
    player.stableTiles = [old]
    beginTurnScope(player)
    const result = commitFarmOperation(player, { kind: 'stables', positions: [a], standingSpecialStableCount: 1,
      specialStables: [{ ...b, sourceCardId: 'special-stable-source' }] })
    expect(result).toMatchObject({ kind: 'stables', stables: [
      { kind: 'normal', ordinal: 3 }, { kind: 'special', ordinal: 4, sourceCardId: 'special-stable-source' },
    ] })
    expect(countDistinctStablesBuiltThisTurn(player)).toBe(2)
  })

  it('retains fence construction after return, and ignores palisades', () => {
    const player = makePlayer()
    beginTurnScope(player)
    const prepared = structuredClone(player)
    prepared.fenceSegments = [{ edge: '0,0/N', type: 'palisade' }]
    commitFarmOperation(player, { kind: 'fence', positions: [], preparedPlayer: prepared })
    expect(hasBuiltFenceThisTurn(player)).toBe(false)
    const fenced = structuredClone(player)
    fenced.fenceSegments.push({ edge: '0,0/E', type: 'fence' })
    commitFarmOperation(player, { kind: 'fence', positions: [], preparedPlayer: fenced })
    commitFarmOperation(player, { kind: 'remove-fences', positions: [], indexes: [1] })
    expect(hasBuiltFenceThisTurn(player)).toBe(true)
  })

  it('does not open a Turn when committing outside a scope', () => {
    const player = makePlayer()
    stable(player)
    commitFarmOperation(player, { kind: 'rooms', positions: [b] })
    expect(readTurnScopeToken(player)).toBeUndefined()
    expect(hasBuiltStableThisTurn(player)).toBe(false)
    expect(roomTypeBuiltThisTurn(player)).toBeUndefined()
  })
})
