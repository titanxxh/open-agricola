import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertRuleOutcome, confirmNext } from './_helpers/negative-rule-audit'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

describe('ae-negative-37-food', () => {
  const { sessions, ok, save, setup, finish, next, move, prerequisites, hand, buy, printed, denyMinor } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D053 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'D053_TeaHouse', s = setup(card, 6, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "wood": 1, "stone": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 2); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.stone, 0); save('D053-N1-legal', r); const t = setup(card, 6, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "wood": 0, "stone": 1 }); }); denyMinor(t, card); save('D053-N1-short', t.getState()); const excluded = setup(card, 5, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "wood": 1, "stone": 1 }); }); denyMinor(excluded, card); save('D053-N1-prerequisite', excluded.getState()); });
  it('D053 N2 real second turn activation skips that placement while retaining the worker for later', () => { const card = 'D053_TeaHouse', s = setup(card, 6, st => { hand(st, card); Object.assign(st.players[0]!.resources, { wood: 1, stone: 1 }); }); finish(s, buy(s, card)); move(s, 'forest'); next(s); let r = s.getState(); save('D053-N2-before', r); const action = r.interaction.anytimeActions.find(a => a.sourceCard === card); assert.ok(action); r = ok(s.takeAnytimeAction(0, action.id)); save('D053-N2-after', r); const skipPending = r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player'; const second = s.takeAction(0, 'reed-bank'); save('D053-N2-immediate-second', second); const actual = { food: second.state.players[0]!.resources.food, skipPending, immediateSecondOk: second.ok, placed: second.state.actionSpaces.flatMap(a => a.takenBy).filter(t => t.playerId === second.state.players[0]!.id).length, opponentPlaced: second.state.actionSpaces.flatMap(a => a.takenBy).filter(t => t.playerId === second.state.players[1]!.id).length }; assertRuleOutcome(actual, { food: 41, skipPending: true, immediateSecondOk: false, placed: 1, opponentPlaced: 1 }); });
  it('D053 N3 decline keeps a legal second placement and a used reward cannot be claimed twice before or after a natural round reset', () => {
      const card = 'D053_TeaHouse';
      for (const use of [false, true]) {
          const s = setup(card, 6, st => { hand(st, card); Object.assign(st.players[0]!.resources, { wood: 1, stone: 1 }); });
          finish(s, buy(s, card));
          move(s, 'forest');
          next(s);
          let r = s.getState();
          let opponentSpent = false;
          if (use) {
              const a = r.interaction.anytimeActions.find(a => a.sourceCard === card);
              assert.ok(a);
              r = ok(s.takeAnytimeAction(0, a.id));
              assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, a.id));
          }
          if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
              confirmNext(s, r);
              move(s, 'clay-pit');
              next(s);
              opponentSpent = true;
          }
          r = finish(s, ok(s.takeAction(0, 'reed-bank')));
          assert.equal(r.state.players[0]!.resources.food, use ? 41 : 40);
          assert.equal(r.state.actionSpaces.flatMap(a => a.takenBy).filter(t => t.playerId === r.state.players[0]!.id).length, 2);
          save(`D053-N3-first-${use}`, r);
          if (!opponentSpent)
              move(s, 'clay-pit');
          r = confirmNext(s, s.getState());
          assert.equal(r.state.round, 7);
          assert.ok(!r.interaction.anytimeActions.some(a => a.sourceCard === card));
          move(s, 'grain-seeds');
          move(s, 'forest');
          next(s);
          r = s.getState();
          const a = r.interaction.anytimeActions.find(a => a.sourceCard === card);
          assert.ok(a);
          r = ok(s.takeAnytimeAction(0, a.id));
          assert.equal(r.state.players[0]!.resources.food, use ? 42 : 41);
          assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, a.id));
          save(`D053-N3-reset-${use}`, r);
      }
  });
})
