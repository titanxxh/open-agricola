import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit04Harvest from './_helpers/audit/ae-negative-04-harvest'

describe('ae-negative-04-harvest', () => {
  const { BEETS, sessions, ok, setup, buy, deniedBuy, fields, future, naturalTurn } = audit04Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Fodder Beets field prerequisite and exact future rounds', () => {
    it('E044 N1 two field tiles including an extra card field cannot satisfy three field tiles', () => {
      for (const extra of [false, true]) deniedBuy(setup(BEETS, state => { fields(state, 2); if (extra) state.players[0]!.minorPlayed = ['E070_CropRotationField'] }), BEETS)
      const s = setup(BEETS, state => fields(state, 3))
      const r = buy(s, BEETS); assert(r.state.players[0]!.minorPlayed.includes(BEETS)); assert.deepEqual(future(r).map(m => m.round), [5, 7, 9, 11, 13])
    })
    it('E044 N2 current and past odd rounds never receive food and last rounds invent no future', () => {
      for (const [round, targets] of [[3, [5, 7, 9, 11, 13]], [12, [13]], [13, []], [14, []]] as const) {
        const s = setup(BEETS, state => { state.round = round; fields(state, 3) }); const r = buy(s, BEETS)
        assert.deepEqual(future(r), targets.map(target => ({ round: target, resources: { food: 1 } })))
        assert.equal(r.state.players[0]!.resources.food, 20)
      }
    })
    it('E044 N3 whole-action undo removes all future food and retry schedules once', () => {
      const s = setup(BEETS, state => fields(state, 3)); const before = undoRuleSnapshot(s.getState())
      const r = buy(s, BEETS); assert.equal(future(r).length, 5); assertRejectedUnchanged(s, () => s.resolveChoice(0, BEETS))
      assertUndoRestored(before, s.undoAction()); assert.deepEqual(future(s.getState()), [])
      assert.deepEqual(future(buy(s, BEETS)).map(m => m.round), [5, 7, 9, 11, 13])
    })
    it('E044 N4 natural next odd round delivers one food exactly once', () => {
      const s = setup(BEETS, state => { state.round = 2; fields(state, 3) })
      let r = confirmNext(s, buy(s, BEETS)); assert.equal(r.state.round, 2)
      naturalTurn(s, 1, 'grain-seeds'); naturalTurn(s, 0, 'day-laborer'); r = naturalTurn(s, 1, 'clay-pit')
      assert.equal(r.state.round, 3); assert.equal(r.state.players[0]!.resources.food, 23)
      assert.deepEqual(future(r).map(m => m.round), [5, 7, 9, 11, 13])
      const work = ok(s.takeAction(0, 'grain-seeds')); assert.equal(work.state.players[0]!.resources.food, 23)
    })
    it('E044 N5 natural even round pays no scheduled food', () => {
      const s = setup(BEETS, state => { state.round = 1; fields(state, 3) })
      confirmNext(s, buy(s, BEETS)); naturalTurn(s, 1, 'grain-seeds'); naturalTurn(s, 0, 'day-laborer'); const r = naturalTurn(s, 1, 'clay-pit')
      assert.equal(r.state.round, 2); assert.equal(r.state.players[0]!.resources.food, 22)
      assert.deepEqual(future(r).map(m => m.round), [3, 5, 7, 9, 11, 13])
    })
  })
})
