import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, take, finish, play, undo, reach, pasture, res, future } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B164 N1 real round-one purchase queues four sheep and natural third round delivers the first', () => { const s = make('B164_SheepWhisperer', st => pasture(st.players[0]!), false, 1), bought = finish(s, play(s, 'B164_SheepWhisperer')); assert.deepEqual(future(bought), [3, 6, 9, 11]); res(bought, { sheep: 0 }); const two = reach(s, 2); res(two, { sheep: 0 }); const three = reach(s, 3); res(three, { sheep: 1 }); assert.equal(three.state.players[0]!.pastures[0]!.animalCount, 1); assert.deepEqual(future(three), [6, 9, 11]); save('B164-N1', { bought, two, three }); });
  it('B164 N2 late purchases truncate future rounds and natural14 delivers the last sheep', () => { for (const round of [12, 13, 14]) {
      const s = make('B164_SheepWhisperer', st => pasture(st.players[0]!), false, round), bought = finish(s, play(s, 'B164_SheepWhisperer'));
      assert.deepEqual(future(bought), round === 12 ? [14] : []);
      res(bought, { sheep: 0 });
      if (round === 12) {
          const thirteen = reach(s, 13), fourteen = reach(s, 14);
          res(thirteen, { sheep: 0 });
          res(fourteen, { sheep: 1 });
          assert.deepEqual(future(fourteen), []);
          save(`B164-N2-${round}`, { bought, thirteen, fourteen });
      }
      else
          save(`B164-N2-${round}`, bought);
  } });
  it('B164 N3 held card and real whole-purchase undo cannot leave queued or immediate sheep', () => { const h = make('B164_SheepWhisperer', undefined, false, 1), held = finish(h, take(h, 0, 'grain-seeds'), true, [], 'B164_SheepWhisperer'), s = make('B164_SheepWhisperer', undefined, false, 1), bought = finish(s, play(s, 'B164_SheepWhisperer')), u = undo(s); assert.deepEqual(future(held), []); assert.deepEqual(future(u), []); res(held, { sheep: 0 }); res(u, { sheep: 0 }); assert.ok(u.state.players[0]!.occupationHand.includes('B164_SheepWhisperer')); save('B164-N3', { held, bought, u }); });
})
