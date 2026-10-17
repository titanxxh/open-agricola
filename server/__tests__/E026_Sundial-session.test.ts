import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { workersAvailable } from '../../shared/domain/player'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, select, finish, end, purchase, resource, occupied, field } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("E026 N1 real purchase and natural ends of rounds seven and nine sow without another person", () => { const b = make('E026_Sundial', st => { st.players[0]!.resources.wood = 1; }, false), bought = purchase(b, 'E026_Sundial'); resource(bought, { wood: 0 }); for (const round of [7, 9]) {
      const s = make('E026_Sundial', st => { field(st.players[0]!); st.players[0]!.resources.grain = 1; }, true, round), p = end(s, true, [], undefined, 'sow');
      assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select' && p.interaction.request.farm.farmType === 'sow');
      assert.equal(occupied(p).length, 2);
      assert.equal(workersAvailable(p.state, p.state.players[0]!), 0);
      const r = finish(s, select(s, 0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }), false);
      resource(r, { grain: 1 });
      assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2);
      save(`E026-N1-${round}`, { bought, p, r });
  } });
  it("E026 N2 wrong rounds absent field absent crop held card and optional decline cannot sow", () => { for (const mode of ['six', 'eight', 'ten', 'field', 'crop', 'hand', 'decline']) {
      const round = mode === 'six' ? 6 : mode === 'eight' ? 8 : mode === 'ten' ? 10 : 7, s = make('E026_Sundial', st => { if (mode !== 'field')
          field(st.players[0]!); if (mode !== 'crop')
          st.players[0]!.resources.grain = 1; }, mode !== 'hand', round), r = end(s, mode !== 'decline', [], mode === 'decline' ? undefined : 'E026_Sundial');
      assert.equal(r.state.players[0]!.fields[0]?.stacks.length ?? 0, 0);
      resource(r, { grain: mode === 'crop' ? 0 : 1 });
      save(`E026-N2-${mode}`, r);
  } });
  it("E026 N3 invalid field target rejects at the genuine Sundial sow window before a legal retry", () => { const s = make('E026_Sundial', st => { field(st.players[0]!); st.players[0]!.resources.grain = 1; }, true, 7), p = end(s, true, [], undefined, 'sow'), bad = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 0, col: 4, crop: 'grain' }] })), r = finish(s, select(s, 0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }), false); resource(r, { grain: 1 }); assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2); save('E026-N3', { p, bad, r }); });
})
