import assert from 'node:assert/strict'
import { it, describe } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { workersAvailable } from '../../shared/domain/player'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit04Animals from './_helpers/audit/ae-negative-04-animals'

describe('ae-negative-04-animals', () => {
  const { D, wait, options, place, finish, placed, director, opponentSow, ownerWindow, acceptDirector } = audit04Animals
  describe('04 animals negative Session audit', () => {
    it('C151 N1 a real opponent Grain Utilization gives one free owner sow without an additional worker', () => {
            const s = director();
            let r = opponentSow(s);
            const before = workersAvailable(r.state, r.state.players[0]!);
            assert.equal(before, 1);
            r = acceptDirector(s, r);
            assert.equal(r.state.players[0]!.resources.grain, 1);
            r = s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] });
            assert.equal(r.ok, true, r.error);
            assert.equal(r.state.players[0]!.resources.grain, 0);
            assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }]);
            assert.deepEqual(r.state.players[1]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }]);
            assert.equal(workersAvailable(r.state, r.state.players[0]!), before);
            assert.deepEqual(placed(r), ['grain-seeds']);
            assert.ok(r.scores);
            assert.equal(r.scores[0]!.categories.find(c => c.key === 'grains')!.total, 1);
            assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] }));
            s.dispose();
        });
    it('C151 N2 the owner using Grain Utilization and an opponent using another space do not trigger the card', () => {
            const own = director(state => { state.players[0]!.resources.grain = 1; });
            let r = place(own, 0, 'grain-utilization');
            assert.equal(wait(r).request.kind, 'farm-select');
            r = own.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] });
            assert.equal(r.ok, true, r.error);
            assert.equal(r.interaction.stateId === 'wait' && r.interaction.sourceCard === D, false);
            assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }]);
            own.dispose();
            const other = director();
            finish(other, place(other, 0, 'grain-seeds'));
            r = place(other, 1, 'day-laborer');
            assert.equal(r.interaction.stateId === 'wait' && r.interaction.sourceCard === D, false);
            assert.equal(r.state.players[0]!.resources.grain, 1);
            assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, []);
            other.dispose();
        });
    it('C151 N3 foreign actor room occupied field missing seed and excess seeds cannot sow before a legal retry', () => {
            const s = director(state => { state.players[0]!.fields.push({ row: 0, col: 3, stacks: [] }, { row: 0, col: 4, stacks: [{ kind: 'grain', remaining: 3 }] }); });
            let r = acceptDirector(s, opponentSow(s));
            assert.equal(r.state.players[0]!.resources.grain, 1);
            assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { crops: [{ row: 0, col: 2, crop: 'grain' }] }));
            const attempts: Parameters<GameSession['commitSelectionChoice']>[1][] = [{ crops: [{ row: 1, col: 0, crop: 'grain' }] }, { crops: [{ row: 0, col: 4, crop: 'grain' }] }, { crops: [{ row: 0, col: 2, crop: 'vegetable' }] }, { crops: [{ row: 0, col: 2, crop: 'grain' }, { row: 0, col: 3, crop: 'grain' }] }];
            for (const payload of attempts) {
                assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, payload));
            }
            r = s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] });
            assert.equal(r.ok, true, r.error);
            assert.equal(r.state.players[0]!.resources.grain, 0);
            assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks), [[{ kind: 'grain', remaining: 3 }], [], [{ kind: 'grain', remaining: 3 }]]);
            s.dispose();
        });
    it('C151 N4 opponent bake-only use still triggers but an owner with no empty field gains no crop', () => {
            const s = director(state => { state.players[1]!.fields = []; state.players[1]!.improvements = ['Major_Fireplace1']; });
            finish(s, place(s, 0, 'grain-seeds'));
            let r = place(s, 1, 'grain-utilization');
            if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === 'Major_Fireplace1')) {
                r = s.resolveChoice(1, 'Major_Fireplace1');
                assert.equal(r.ok, true, r.error);
            }
            assert.equal(r.state.players[1]!.resources.grain, 0);
            assert.equal(r.state.players[1]!.resources.food, 22);
            r = acceptDirector(s, ownerWindow(s, r));
            assert.equal(workersAvailable(r.state, r.state.players[0]!), 1);
            r = s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] });
            assert.equal(r.ok, true, r.error);
            assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }]);
            s.dispose();
            const full = director(state => { state.players[0]!.fields[0]!.stacks = [{ kind: 'grain', remaining: 3 }]; });
            finish(full, place(full, 0, 'grain-seeds'));
            r = place(full, 1, 'grain-utilization');
            assert.equal(wait(r).playerIndex, 1);
            r = full.commitSelectionChoice(1, { crops: [{ row: 0, col: 2, crop: 'grain' }] });
            assert.equal(r.ok, true, r.error);
            r = finish(full, r);
            assert.equal(r.state.players[0]!.resources.grain, 1);
            assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 3 }]);
            full.dispose();
        });
    it('C151 N5 declining the owner reaction preserves seeds and later occupied source requests cannot repeat it', () => {
            const s = director();
            let r = opponentSow(s);
            assert.ok(options(r).some(o => o.value === '__skip__'));
            r = s.resolveChoice(0, '__skip__');
            assert.equal(r.ok, true, r.error);
            r = finish(s, r);
            assert.equal(r.state.currentPlayerIndex, 2);
            assert.equal(r.state.players[0]!.resources.grain, 1);
            assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, []);
            assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] }));
            assertRejectedUnchanged(s, () => s.takeAction(2, 'grain-utilization'));
            s.dispose();
        });
  })
})
