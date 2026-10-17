import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit29Farm from './_helpers/audit/ae-negative-29-farm'

describe('ae-negative-29-farm', () => {
  const { sessions, save, ok, finish, choose, buy, accept, newly } = audit29Farm
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C017 N1 actual exact three field purchase allows a disconnected fourth field and rejects an occupied tile and wrong actor before legal retry', () => { const s = newly(), purchase = buy(s, 'C017_NewlyPlowedField'), p = accept(s, purchase); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select'); const occupied = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })), wrong = assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { tile: { row: 2, col: 4 } })), r = finish(s, ok(s.commitSelectionChoice(0, { tile: { row: 2, col: 4 } }))); assert.equal(r.state.players[0]!.fields.length, 4); assert.ok(r.state.players[0]!.fields.some(f => f.row === 2 && f.col === 4)); save('C017-N1', { purchase, p, occupied, wrong, r }); });
  it('C017 N2 two and four farm fields and two farm fields plus a card field fail exactly three field tiles', () => { const rows = []; for (const [n, cf] of [[2, false], [4, false], [2, true]] as const) {
      const s = newly(n, cf), r = buy(s, 'C017_NewlyPlowedField');
      assert.ok(r.state.players[0]!.minorHand.includes('C017_NewlyPlowedField'));
      const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'C017_NewlyPlowedField'));
      assert.equal(r.state.players[0]!.fields.length, n);
      rows.push({ r, bad });
  } save('C017-N2', rows); });
  it('C017 N3 actual optional decline leaves exactly three fields after purchase', () => { const s = newly(), purchase = buy(s, 'C017_NewlyPlowedField'), r = finish(s, choose(s, purchase, o => o.value === '__skip__')); assert.equal(r.state.players[0]!.fields.length, 3); assert.ok(r.state.players[0]!.minorPlayed.includes('C017_NewlyPlowedField')); save('C017-N3', { purchase, r }); });
})
