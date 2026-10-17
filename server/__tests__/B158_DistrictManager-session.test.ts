import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, finish, play, undo, res, phase, qualifying } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B158 N1 real purchase and two actual wood spaces pay only at work-phase end', () => { const b = make('B158_DistrictManager', undefined, false), bought = finish(b, play(b, 'B158_DistrictManager')), u = undo(b), s = make('B158_DistrictManager'), x = phase(s, qualifying); res(x.before, { food: 100 }); res(x.r, { food: 105 }); save('B158-N1', { bought, u, ...x }); });
  it('B158 N2 one space split ownership and held card cannot receive five food', () => { for (const mode of ['forest', 'grove', 'split', 'hand']) {
      const s = make('B158_DistrictManager', undefined, mode !== 'hand'), places: Array<[
          number,
          string
      ]> = mode === 'hand' ? qualifying : [[0, mode === 'grove' ? 'grove' : 'forest'], [1, mode === 'split' ? 'grove' : 'clay-pit'], [2, 'reed-bank'], [3, 'fishing'], [0, 'grain-seeds']], x = phase(s, places);
      res(x.r, { food: 100 });
      save(`B158-N2-${mode}`, x);
  } });
  it('B158 N3 the reward repeats only after two fresh qualifying placements next round', () => { const s = make('B158_DistrictManager'), first = phase(s, qualifying), second = phase(s, qualifying); res(first.r, { food: 105 }); res(second.before, { food: 105 }); assert.equal(second.r.state.round, 7); res(second.r, { food: 110 }); save('B158-N3', { first, second }); });
})
