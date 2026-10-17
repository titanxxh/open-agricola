import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { it, describe } from 'vitest'
import type { InteractionAnimalReorgZone } from '../../shared/contract/types'
import { assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit04Animals from './_helpers/audit/ae-negative-04-animals'

describe('ae-negative-04-animals', () => {
  const { A, setup, wait, place, finish, buy, advanceBought, settleAnimals } = audit04Animals
  describe('04 animals negative Session audit', () => {
    it('B084 N1 reed shortage and two occupations exclude the enabled card and forged requests while a legal buy schedules two pigs', () => {
            for (const config of ['fee', 'occupation']) {
                const s = setup(A, state => { if (config === 'fee')
                    state.players[0]!.resources.reed = 0;
                else
                    state.players[0]!.occupationPlayed.pop(); }, false);
                let r = place(s, 0, 'meeting-place');
                if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
                    const b = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-') && !o.disabled);
                    if (b) {
                        r = s.resolveChoice(0, b.value);
                        assert.equal(r.ok, true, r.error);
                    }
                }
                assert.equal(r.state.players[0]!.minorPlayed.includes(A), false);
                assert.equal(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === A && !o.disabled), false);
                assertRejectedUnchanged(s, () => s.resolveChoice(0, A));
                s.dispose();
            }
            const s = setup(A, () => { }, false);
            const r = buy(s, A);
            assert.equal(r.state.players[0]!.resources.reed, 0);
            assert.equal(r.state.players[0]!.resources.boar, 0);
            assert.deepEqual(r.state.futureMeeples.filter(x => x.cardId === A).map(x => ({ round: x.round, resources: x.resources })), [{ round: 2, resources: { boar: 1 } }, { round: 3, resources: { boar: 1 } }]);
            s.dispose();
        });
    it('B084 N2 two natural next rounds receive exactly one pig each for the owner without an early or duplicate award', () => {
            const s = setup(A, () => { }, false);
            let r = advanceBought(s, buy(s, A));
            assert.equal(r.state.round, 2);
            r = settleAnimals(s, r);
            assert.equal(r.state.players[0]!.resources.boar, 1);
            assert.equal(r.state.players[1]!.resources.boar, 0);
            assert.deepEqual(r.state.futureMeeples.filter(x => x.cardId === A).map(x => x.round), [3]);
            finish(s, place(s, 0, 'forest'));
            finish(s, place(s, 1, 'grain-seeds'));
            finish(s, place(s, 0, 'clay-pit'));
            r = finish(s, place(s, 1, 'reed-bank'));
            assert.equal(r.state.round, 3);
            r = settleAnimals(s, r);
            assert.equal(r.state.players[0]!.resources.boar, 2);
            assert.equal(r.state.players[1]!.resources.boar, 0);
            assert.deepEqual(r.state.futureMeeples.filter(x => x.cardId === A), []);
            const p = r.state.players[0]!;
            assert.equal(countRoomAnimals(p) + Object.values(p.stableAnimals).reduce((sum, a) => sum + (a.animalType === 'boar' ? a.animalCount : 0), 0), 2);
            s.dispose();
        });
    it('B084 N3 the first arrival rejects illegal housing and accepts one legal pig placement', () => {
            const s = setup(A, () => { }, false);
            let r = advanceBought(s, buy(s, A));
            const i = wait(r);
            assert.ok(i.request.kind === 'animal-reorg');
            const unknown: InteractionAnimalReorgZone = { id: 'not-a-storage-zone', zoneType: 'stable', animalType: 'boar', animalCount: 1, capacity: 1 };
            assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [unknown] }));
            const tooMany = i.request.zones.map<InteractionAnimalReorgZone>(z => z.zoneType === 'house' ? { ...z, animalType: 'boar', animalCount: 2 } : z);
            assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: tooMany }));
            const cattle = i.request.zones.map<InteractionAnimalReorgZone>(z => z.zoneType === 'house' ? { ...z, animalType: 'cattle', animalCount: 1 } : z);
            assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: cattle }));
            r = settleAnimals(s, r);
            assert.equal(r.state.players[0]!.resources.boar, 1);
            assert.equal(r.state.players[0]!.resources.cattle, 0);
            assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: tooMany }));
            s.dispose();
        });
    it('B084 N4 late schedules retain only round fourteen and an already played card cannot duplicate future pigs', () => {
            for (const { round, expected } of [{ round: 13, expected: [14] }, { round: 14, expected: [] }]) {
                const s = setup(A, () => { }, false, round);
                const r = buy(s, A);
                assert.equal(r.state.players[0]!.resources.reed, 0);
                assert.deepEqual(r.state.futureMeeples.filter(x => x.cardId === A).map(x => x.round), expected);
                assertRejectedUnchanged(s, () => s.resolveChoice(0, A));
                s.dispose();
            }
        });
    it('B084 N5 undo of the actual buy restores its reed hand future supply and score', () => {
            const s = setup(A, () => { }, false);
            const before = JSON.stringify(s.getState().scores);
            buy(s, A);
            const r = s.undoAction();
            assert.equal(r.ok, true, r.error);
            assert.equal(r.state.players[0]!.resources.reed, 1);
            assert.ok(r.state.players[0]!.minorHand.includes(A));
            assert.deepEqual(r.state.futureMeeples, []);
            assert.equal(JSON.stringify(r.scores), before);
            s.dispose();
        });
    it('B084 N6 animal reorganization cannot move a not-yet-due future pig into the available supply', () => {
            const s = setup(A, () => { }, false);
            let r = advanceBought(s, buy(s, A));
            assert.equal(r.state.round, 2);
            assert.equal(r.state.players[0]!.resources.boar, 1);
            assert.equal(r.state.futureMeeples.filter(x => x.cardId === A).length, 1);
            const i = wait(r);
            assert.ok(i.request.kind === 'animal-reorg');
            const two = i.request.zones.map<InteractionAnimalReorgZone>(z => z.id === 'house:2-0' || z.zoneType === 'stable' ? { ...z, animalType: 'boar', animalCount: 1 } : z);
            assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: two }));
            r = settleAnimals(s, r);
            assertRuleOutcome({ availablePig: r.state.players[0]!.resources.boar, futurePig: r.state.futureMeeples.filter(x => x.cardId === A).length, round: r.state.round }, { availablePig: 1, futurePig: 1, round: 2 });
            s.dispose();
        });
  })
})
