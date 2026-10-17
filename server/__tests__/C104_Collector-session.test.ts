import assert from 'node:assert/strict'
import { it, describe } from 'vitest'
import { assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit03Crops from './_helpers/audit/ae-negative-03-crops'

describe('ae-negative-03-crops', () => {
  const { C, setup, wait, finish, place, ownerUsed } = audit03Crops
  describe('03 crops negative Session audit', () => {
    it('C104 N1 wrong distinct counts cannot grant goods and six-good retry settles one begging marker', () => {
            const s = setup(C);
            let r = place(s, 0, C);
            for (const value of ['wood,clay,reed,stone,food', 'wood,clay,reed,stone,food,wood', 'wood,clay,reed,stone,food,grain,vegetable']) {
                const before = JSON.stringify(r.state.players[0]!.resources);
                const unchanged = JSON.stringify({ log: r.state.log, scores: r.scores });
                r = s.resolveChoice(0, value);
                assert.equal(r.ok, true, r.error);
                wait(r);
                assert.equal(ownerUsed(r), 0);
                assert.equal(JSON.stringify(r.state.players[0]!.resources), before);
                assert.equal(JSON.stringify({ log: r.state.log, scores: r.scores }), unchanged);
            }
            assertRejectedUnchanged(s, () => s.resolveChoice(1, 'wood,clay,reed,stone,food,grain'));
            r = s.resolveChoice(0, 'wood,clay,reed,stone,food,grain');
            assert.equal(r.ok, true, r.error);
            assert.equal(ownerUsed(r), 1);
            assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.stone, r.state.players[0]!.resources.grain, r.state.players[0]!.resources.begging], [1, 1, 1, 1, 1, 1]);
            assert.equal(r.state.players[0]!.resources.food, 21);
            assert.ok(r.scores);
            assert.equal(r.scores[0]!.categories.find(c => c.key === 'beggings')!.total, -3);
            assert.equal(r.scores[0]!.categories.find(c => c.key === 'grains')!.total, 1);
            assertRejectedUnchanged(s, () => s.resolveChoice(0, 'wood,clay,reed,stone,food,grain'));
            s.dispose();
        });
    it('C104 N2 real opponent turn and fifth-use limit cannot use the owners card', () => {
            const s = setup(C);
            finish(s, place(s, 0, 'grain-seeds'));
            assertRejectedUnchanged(s, () => s.takeAction(1, C));
            s.dispose();
            const exhausted = setup(C, state => { state.players[0]!.cardStates[C] = { extraData: { used: 4 } }; });
            assertRejectedUnchanged(exhausted, () => exhausted.takeAction(0, C));
            assert.equal(exhausted.getState().state.players[0]!.resources.begging, 0);
            exhausted.dispose();
        });
    it('C104 N3 a begging marker is not a sixth different good and cannot grant an extra penalty', () => {
            const s = setup(C);
            place(s, 0, C);
            const r = s.resolveChoice(0, 'wood,clay,reed,stone,food,begging');
            assert.equal(r.ok, true, r.error);
            assertRuleOutcome({ used: ownerUsed(r), wood: r.state.players[0]!.resources.wood, begging: r.state.players[0]!.resources.begging }, { used: 0, wood: 0, begging: 0 });
            wait(r);
            s.dispose();
        });
    it('C104 N4 undo of six-good use restores gains begging count card counter and worker', () => {
            const s = setup(C);
            const before = JSON.stringify(s.getState().state.players[0]!.resources);
            const score = JSON.stringify(s.getState().scores);
            place(s, 0, C);
            s.resolveChoice(0, 'wood,clay,reed,stone,food,grain');
            const r = s.undoAction();
            assert.equal(r.ok, true, r.error);
            assert.equal(JSON.stringify(r.state.players[0]!.resources), before);
            assert.equal(JSON.stringify(r.scores), score);
            assert.equal(ownerUsed(r), 0);
            assert.deepEqual(r.state.actionSpaces.find(x => x.id === C)!.takenBy, []);
            s.dispose();
        });
    it('C104 N5 recorded prior uses demand seven eight and nine different goods rather than six', () => {
            for (const [used, needed] of [[1, 7], [2, 8], [3, 9]]) {
                const s = setup(C, state => { state.players[0]!.cardStates[C] = { extraData: { used } }; });
                let r = place(s, 0, C);
                const i = wait(r);
                assert.equal(i.promptParams?.needed, needed);
                r = s.resolveChoice(0, 'wood,clay,reed,stone,food,grain');
                wait(r);
                assert.equal(ownerUsed(r), used);
                assert.equal(r.state.players[0]!.resources.begging, 0);
                assert.equal(r.state.players[0]!.resources.wood, 0);
                s.dispose();
            }
        });
  })
})
