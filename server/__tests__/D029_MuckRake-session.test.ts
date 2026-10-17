import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, final, purchase, rejectBuy, undo, resource, bonus, stableFarm } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("D029 N1 real purchase and three distinct legally housed unfenced species score three at actual final", () => { const b = make('D029_MuckRake', st => { st.players[0]!.resources.wood = 1; }, false), bought = purchase(b, 'D029_MuckRake'), u = undo(b); resource(bought, { wood: 0 }); const s = make('D029_MuckRake', st => stableFarm(st.players[0]!, ['sheep', 'boar', 'cattle']), true, 14), r = final(s); assert.equal(bonus(r, 'D029_MuckRake'), 3); save('D029-N1', { bought, u, r }); });
  it("D029 N2 duplicate species empty stable fenced stable and house animals do not add extra stable points", () => { for (const mode of ['duplicate', 'empty', 'fenced', 'house']) {
      const s = make('D029_MuckRake', st => { const p = st.players[0]!; if (mode === 'duplicate')
          stableFarm(p, ['sheep', 'sheep']); if (mode === 'empty')
          p.stableTiles = [{ row: 0, col: 1 }]; if (mode === 'fenced') {
          p.pastures = [{ id: 'fenced', tiles: [{ row: 0, col: 1 }], animalType: 'sheep', animalCount: 1 }];
          p.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }));
          p.stableTiles = [{ row: 0, col: 1 }];
          p.resources.sheep = 1;
      } if (mode === 'house') {
          p.houseAnimals = { '1-0': 'sheep' };
          p.resources.sheep = 1;
      } }, true, 14), r = final(s);
      assert.equal(bonus(r, 'D029_MuckRake'), mode === 'duplicate' ? 1 : 0);
      save(`D029-N2-${mode}`, r);
  } });
  it("D029 N3 held Muck Rake or no wood cannot receive its stable points or be purchased", () => { const b = make('D029_MuckRake', undefined, false); save('D029-N3-short', rejectBuy(b, 'D029_MuckRake')); const s = make('D029_MuckRake', st => stableFarm(st.players[0]!, ['sheep', 'boar', 'cattle']), false, 14), r = final(s); assert.equal(bonus(r, 'D029_MuckRake'), 0); save('D029-N3-held', r); });
})
