import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertRuleOutcome, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit09Harvest from './_helpers/audit/ae-negative-09-harvest'

describe('ae-negative-09-harvest', () => {
  const { BASKET, sessions, ok, turn, buy, deny, gainCount, resource, save, fields, sowStart, sow, afterSowHarvest, printedVp, pellets } = audit09Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A065 N1 two distinct fields reject forged free purchase before three fields control', () => {
    deny(pellets({ played: false, fields: fields(null, null), resources: { food: 0 } }), BASKET); const r = buy(pellets({ played: false, resources: { food: 0 } }), BASKET); assert.ok(r.state.players[0]!.minorPlayed.includes(BASKET)); assert.equal(r.state.players[0]!.resources.grain, 0); resource(r, 'food', 0); assert.equal(printedVp(r, BASKET), 0)
  })
  it('A065 N2 zero stock unconditional Sow grants one grain before actual legal planting', () => {
    const s = pellets(); const pending = sowStart(s); assert.equal(pending.state.players[0]!.resources.grain, 1); assert.equal(gainCount(pending, BASKET), 1); const r = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })); save('A065-N2-sown', r); assert.equal(r.state.players[0]!.resources.grain, 0); assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }]); assert.equal(gainCount(r, BASKET), 1)
  })
  it('A065 N3 illegal target crop and overstock selection reject before one field retry', () => {
    const s = pellets(); const pending = sowStart(s); assert.equal(pending.state.players[0]!.resources.grain, 1); for (const crops of [[{ row: 0, col: 0, crop: 'grain' }], [{ row: 99, col: 99, crop: 'grain' }], [{ row: 0, col: 2, crop: 'vegetable' }], [{ row: 0, col: 2, crop: 'grain' }, { row: 1, col: 2, crop: 'grain' }]] satisfies Array<Array<{ row: number; col: number; crop: 'grain' | 'vegetable' }>>) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops })); assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { crops: [{ row: 0, col: 2, crop: 'grain' }] })); const r = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(gainCount(r, BASKET), 1); assert.equal(r.state.players[0]!.fields.filter(f => f.stacks.length).length, 1)
  })
  it('A065 N4 consumed Sow cannot repeat grant and a real later Sow grants once again', () => {
    const s = pellets({ round: 10 }); sow(s, [{ row: 0, col: 2, crop: 'grain' }]); assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 1, col: 2, crop: 'grain' }] })); const next = afterSowHarvest(s); assert.equal(next.state.round, 11); assert.equal(gainCount(next, BASKET), 1); const r = sow(s, [{ row: 1, col: 2, crop: 'grain' }]); save('A065-N4-second', r); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(gainCount(r, BASKET), 2); assert.equal(r.state.players[0]!.fields.filter(f => f.stacks.length).length, 2)
  })
  it('A065 N5 real Chief Forester one field Sow receives no Seed Pellets grain', () => {
    const s = pellets({ occupations: ['A115_ChiefForester'], resources: { grain: 1, food: 4 } }); const pending = sowStart(s, 0, 'forest'); save('A065-N5-limited-pending', pending); const r = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })); save('A065-N5-limited', r); assertRuleOutcome({ grain: r.state.players[0]!.resources.grain, wood: r.state.players[0]!.resources.wood, plantedFields: r.state.players[0]!.fields.filter(f => f.stacks.length).length, seedPelletsGrainGained: gainCount(r, BASKET) }, { grain: 0, wood: 3, plantedFields: 1, seedPelletsGrainGained: 0 })
  })
  it('A065 N6 in hand absent card and actual opponent Sow do not reward holder', () => {
    for (const config of [{ played: false }, { noCard: true }]) { const s = pellets({ ...config, resources: { grain: 1, food: 4 } }); const r = sow(s, [{ row: 0, col: 2, crop: 'grain' }]); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(gainCount(r, BASKET), 0) }
    const s = pellets({ opponentFields: fields(null), opponent: { grain: 1, food: 4 } }); turn(s, 0, 'forest'); sowStart(s, 1); const r = ok(s.commitSelectionChoice(1, { crops: [{ row: 0, col: 2, crop: 'grain' }] })); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(r.state.players[1]!.resources.grain, 0); assert.equal(gainCount(r, BASKET), 0)

  })
  it('A065 N7 Wood Field two planting slots count as one distinct prerequisite field', () => {
    for (const count of [1, 2]) { const s = pellets({ played: false, fields: fields(...Array<null>(count).fill(null)), extra: ['D075_WoodField'], occupations: ['A124_Knapper'], resources: { wood: 2, food: 4 } }); sow(s, [{ row: -1, col: 4075, crop: 'wood' }, { row: -1, col: 4076, crop: 'wood' }]); turn(s, 1, 'clay-pit'); if (count === 1) deny(s, BASKET); else { const r = buy(s, BASKET); assert.ok(r.state.players[0]!.minorPlayed.includes(BASKET)); assert.equal(r.state.players[0]!.resources.grain, 0); resource(r, 'wood', 0); resource(r, 'food', 4) } }
  })
  it('A065 N8 actual Sow undo restores before grant and one replay grain event', () => {
    const s = pellets(); const before = undoRuleSnapshot(s.getState()); sow(s, [{ row: 0, col: 2, crop: 'grain' }]); assertUndoRestored(before, s.undoAction()); const r = sow(s, [{ row: 0, col: 2, crop: 'grain' }]); save('A065-N8-replayed', r); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(gainCount(r, BASKET), 1); assert.equal(r.state.players[0]!.fields.filter(f => f.stacks.length).length, 1)
  })
  it('A065 N6b no empty field enters the designed Sow block and undo restores before a legal action', () => {
    const s = pellets({ fields: fields('grain', 'grain', 'grain') }); const initial = s.getState(); assert.equal(initial.state.players[0]!.fields.length, 3); assert.ok(initial.state.players[0]!.fields.every(f => f.stacks.length > 0)); assert.deepEqual(initial.state.players[0]!.minorPlayed, [BASKET]); assert.deepEqual(initial.state.players[0]!.occupationPlayed, []); assert.deepEqual(initial.state.players[0]!.improvements, []); assert.equal(initial.state.players[0]!.resources.grain, 0); const before = undoRuleSnapshot(initial); const r = s.takeAction(0, 'grain-utilization'); save('A065-N6b-no-target', r); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'engine-blocked') assert.deepEqual(r.interaction.allowedCommands, ['undoStep', 'undoAction']); const actual = { accepted: r.ok, grain: r.state.players[0]!.resources.grain, seedPelletsGrainGained: gainCount(r, BASKET), blockedSow: r.interaction.stateId === 'wait' && r.interaction.request.kind === 'engine-blocked' && r.interaction.request.actionId === 'sow' }; if (r.ok) assertUndoRestored(before, s.undoAction()); const retry = turn(s, 0, 'day-laborer'); resource(retry, 'food', 6); assert.equal(gainCount(retry, BASKET), 0); assert.deepEqual(actual, { accepted: true, grain: 1, seedPelletsGrainGained: 1, blockedSow: true })
  })
})
