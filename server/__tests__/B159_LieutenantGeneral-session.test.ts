import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, take, select, finish, play, undo, res, plow } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B159 N1 real purchase and adjacent opponent plow grant food through13 and grain at14', () => { const b = make('B159_LieutenantGeneral', undefined, false), bought = finish(b, play(b, 'B159_LieutenantGeneral')), u = undo(b); for (const round of [13, 14]) {
      const s = make('B159_LieutenantGeneral', st => { st.currentPlayerIndex = 1; st.players[1]!.fields = [{ row: 0, col: 1, stacks: [] }]; }, true, round), r = plow(s, 1);
      res(r, { food: round === 13 ? 101 : 100, grain: round === 14 ? 1 : 0 });
      assert.equal(r.state.players[1]!.fields.length, 2);
      save(`B159-N1-${round}`, { bought, u, r });
  } });
  it('B159 N2 first field self plow and held card exclude the opponent reward', () => { for (const mode of ['first', 'self', 'hand']) {
      const a = mode === 'self' ? 0 : 1, s = make('B159_LieutenantGeneral', st => { st.currentPlayerIndex = a; if (mode !== 'first')
          st.players[a]!.fields = [{ row: 0, col: 1, stacks: [] }]; }, mode !== 'hand', 13), r = plow(s, a, mode === 'first' ? { row: 0, col: 1 } : { row: 0, col: 2 });
      res(r, { food: 100, grain: 0 });
      save(`B159-N2-${mode}`, r);
  } });
  it('B159 N3 disconnected plow rejects then a real adjacent retry pays once', () => { const s = make('B159_LieutenantGeneral', st => { st.currentPlayerIndex = 1; st.players[1]!.fields = [{ row: 0, col: 1, stacks: [] }]; }, true, 13), p = take(s, 1, 'farmland'), bad = assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { tile: { row: 0, col: 4 } })), r = finish(s, select(s, 1, { tile: { row: 0, col: 2 } })); res(r, { food: 101 }); save('B159-N3', { p, bad, r }); });
})
