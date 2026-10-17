import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

describe('ae-negative-47-cards', () => {
  const { sessions, save, ok, make, finish, ready } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D105 N1 clay and stone accumulation spaces grant their exact distinct food and grain bonuses', () => { const s = make('D105_Sculptor', st => { st.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 3 }), r = finish(s, ok(s.takeAction(0, 'clay-pit'))); assert.equal(r.state.players[0]!.resources.clay, 3); assert.equal(r.state.players[0]!.resources.food, 101); assert.equal(r.state.players[0]!.resources.grain, 0); const c = make('D105_Sculptor', st => { st.actionSpaces.find(a => a.id === 'western-quarry')!.resources.stone = 2 }, true, 14), cr = finish(c, ok(c.takeAction(0, 'western-quarry'))); assert.equal(cr.state.players[0]!.resources.stone, 2); assert.equal(cr.state.players[0]!.resources.grain, 1); assert.equal(cr.state.players[0]!.resources.food, 100); save('D105-N1', { r, cr }) })
  it('D105 N2 real Forest and opponent Clay Pit give no Sculptor bonus to either unqualified recipient', () => { const s = make('D105_Sculptor', st => { st.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3; st.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 3 }), a = finish(s, ok(s.takeAction(0, 'forest')), false); ready(s); const r = finish(s, ok(s.takeAction(1, 'clay-pit'))); assert.equal(r.state.players[0]!.resources.food, 100); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(r.state.players[1]!.resources.food, 100); assert.equal(r.state.players[1]!.resources.clay, 3); save('D105-N2', { a, r }) })
})
