import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'
import * as audit07Future from './_helpers/audit/ae-negative-07-future'

describe('ae-negative-07-future', () => {
  const { TRELLIS, sessions, setup, buy, deny, ready, turn, rounds, complete, food, terrainNormalizedSnapshot, assertTerrainNormalizedUndo, cellOne, cellTwo, fence, fencedPurchase } = audit07Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A047 N1 real purchase denies missing wood and zero built fences give zero schedule', () => {
    deny(setup(TRELLIS), TRELLIS); const r = buy(setup(TRELLIS, { resources: { wood: 1 } }), TRELLIS); assert.equal(r.state.players[0]!.resources.wood, 0); assert.deepEqual(rounds(r, TRELLIS), [])
  })
  it('A047 N2 real four fence construction determines purchase schedule and purchase undo retry', () => {
    const s = setup(TRELLIS, { resources: { wood: 5 } }); fence(s); turn(s, 1, 'forest'); ready(s, 0); const before = terrainNormalizedSnapshot(s.getState()); let r = buy(s, TRELLIS)
    assert.deepEqual(rounds(r, TRELLIS), [6, 7, 8, 9]); assert.equal(r.state.players[0]!.resources.wood, 0); assertRejectedUnchanged(s, () => s.resolveChoice(0, TRELLIS)); assertTerrainNormalizedUndo(before, s.undoAction()); r = buy(s, TRELLIS); assert.deepEqual(rounds(r, TRELLIS), [6, 7, 8, 9]); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), 11)
  })
  it('A047 N3 later actual fencing does not grow locked schedule and natural food pays once to owner', () => {
    const s = setup(TRELLIS, { resources: { wood: 8 } }); fencedPurchase(s); let r = confirmNext(s, turn(s, 1, 'clay-pit')); assert.equal(r.state.round, 6); assert.deepEqual(food(r), [41, 40])
    r = fence(s, cellTwo); assert.equal(r.state.players[0]!.fenceSegments.length, 7); assert.deepEqual(rounds(r, TRELLIS), [7, 8, 9]); turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds'); r = confirmNext(s, turn(s, 1, 'clay-pit')); assert.equal(r.state.round, 7); assert.deepEqual(food(r), [42, 40])
    for (const [i, expected] of [[39, 36], [40, 36], [36, 32]].entries()) { r = complete(s); assert.equal(r.state.round, 8 + i); assert.deepEqual(food(r), expected); assert.deepEqual(rounds(r, TRELLIS), i === 0 ? [9] : []) }
  })
  it('A047 N4 actual opponent fences cannot count for owner Trellises', () => {
    const s = setup(TRELLIS, { resources: { wood: 1 } }, state => { state.players[1]!.resources.wood = 4 }); turn(s, 0, 'grain-seeds'); let r = fence(s, cellOne, 1); assert.equal(r.state.players[1]!.fenceSegments.length, 4); ready(s, 0); r = buy(s, TRELLIS); assert.equal(r.state.players[0]!.fenceSegments.length, 0); assert.deepEqual(rounds(r, TRELLIS), [])
  })
  it('A047 N5 controlled late real fence count purchase cannot schedule after fourteen', () => {
    for (const round of [13, 14]) { const s = setup(TRELLIS, { round, resources: { wood: 5 } }); const r = fencedPurchase(s); assert.deepEqual(rounds(r, TRELLIS), round === 13 ? [14] : []); assert.equal(r.state.players[0]!.fenceSegments.length, 4) }
  })
})
