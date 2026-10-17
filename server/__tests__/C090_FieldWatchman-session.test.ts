import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit44Cards from './_helpers/audit/ae-negative-44-cards'

describe('ae-negative-44-cards', () => {
  const { sessions, save, ok, make, finish } = audit44Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C090 N1 Grain Seeds grants one grain and one optional field with illegal occupied tile rejection and legal retry', () => { const s = make('C090_FieldWatchman'); let p = ok(s.takeAction(0, 'grain-seeds')); while (p.interaction.stateId === 'wait' && p.interaction.request.kind !== 'farm-select') { const q = p.interaction; assert.ok(q.request.kind === 'choice' || q.request.kind === 'select-trigger'); const o = q.request.options.find(o => o.value !== '__skip__' && o.value !== '__pass__'); assert.ok(o); p = ok(s.resolveChoice(q.playerIndex, o.value)) } assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select' && p.interaction.request.farm.farmType === 'plow'); const rejected = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: s.state.players[0]!.roomTiles[0]! })), r = finish(s, ok(s.commitSelectionChoice(0, { tile: p.interaction.request.farm.selectableTiles[0]! }))); assert.equal(r.state.players[0]!.resources.grain, 1); assert.equal(r.state.players[0]!.fields.length, 1); save('C090-N1', { p, rejected, r }) })
  it('C090 N2 decline keeps Grain Seeds grain and Day Laborer never grants a field', () => { const s = make('C090_FieldWatchman'), r = finish(s, ok(s.takeAction(0, 'grain-seeds')), false); assert.equal(r.state.players[0]!.resources.grain, 1); assert.equal(r.state.players[0]!.fields.length, 0); const c = make('C090_FieldWatchman'), cr = finish(c, ok(c.takeAction(0, 'day-laborer'))); assert.equal(cr.state.players[0]!.resources.food, 102); assert.equal(cr.state.players[0]!.fields.length, 0); save('C090-N2', { r, cr }) })
})
