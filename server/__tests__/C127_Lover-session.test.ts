import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { familySize } from '../../shared/domain/player'
import { undoRuleSnapshot, assertUndoRestored, assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

describe('ae-negative-51-family', () => {
  const { sessions, ok, options, save, setup, finish, lesson, play } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C127 N1 real Lover play pays complete-round count and grants no-room growth including zero cost in round fourteen', () => {
    const outcomes = []
    for (const round of [10, 13, 14]) {
      const s = setup('C127_Lover', round, state => state.players[0]!.resources.food = 14 - round)
      const r = finish(s, play(s, 'C127_Lover'), true)
      save(`C127-N1-${round}`, r)
      outcomes.push({ round, family: familySize(r.state.players[0]!), food: r.state.players[0]!.resources.food, rooms: r.state.players[0]!.rooms })
    }
    assertRuleOutcome(outcomes, [{ round: 10, family: 3, food: 0, rooms: 2 }, { round: 13, family: 3, food: 0, rooms: 2 }, { round: 14, family: 3, food: 0, rooms: 2 }])
  })
  it('C127 N2 mandatory four-food cost auto-settles sufficient food and confirms a shortage with begging before growth', () => {
    const card = 'C127_Lover'
    for (const food of [3, 4]) {
      const s = setup(card, 10, state => { state.players[0]!.occupationPlayed = []; state.players[0]!.occupationHand = [card]; state.players[0]!.resources.food = food })
      const before = undoRuleSnapshot(s.getState())
      let r = lesson(s, card)
      if (food === 3) {
        assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
        assert.equal(r.interaction.request.requiresExplicitChoice, true)
        assert.deepEqual(options(r).map(o => o.value), ['confirm'])
        assert.deepEqual(options(r)[0]!.effectPreview, { kind: 'resourceExchange', resourcesPaid: { food: 3 }, resourcesGained: { begging: 1 } })
        assert.equal(familySize(r.state.players[0]!), 2)
        assert.equal(r.state.players[0]!.resources.food, 3)
        assertRejectedUnchanged(s, () => s.resolveChoice(0, '__skip__'))
        r = ok(s.resolveChoice(0, 'confirm'))
      }
      assert.equal(familySize(r.state.players[0]!), 3)
      assert.equal(r.state.players[0]!.rooms, 2)
      assert.equal(r.state.players[0]!.resources.food, 0)
      assert.equal(r.state.players[0]!.resources.begging, food === 3 ? 1 : 0)
      assert.deepEqual(r.state.events.flatMap(e => e.type === 'resource.paid' && e.sourceCardId === card && e.paymentFor === 'cardEffect' ? [e.resources] : []), [{ food }])
      assert.deepEqual(r.state.events.flatMap(e => e.type === 'resource.moved' && e.sourceCardId === card && e.resources.begging ? [e.resources] : []), food === 3 ? [{ begging: 1 }] : [])
      save(`C127-N2-${food}`, r)
      assertUndoRestored(before, s.undoAction())
    }
    const charged = setup(card, 10, state => { state.players[0]!.occupationPlayed = ['A125_Priest']; state.players[0]!.occupationHand = [card]; state.players[0]!.resources.food = 5 })
    const paid = lesson(charged, card)
    assert.equal(familySize(paid.state.players[0]!), 3)
    assert.equal(paid.state.players[0]!.resources.food, 0)
    assert.deepEqual(paid.state.events.flatMap(e => e.type === 'resource.paid' && e.sourceCardId === card ? [{ paymentFor: e.paymentFor, resources: e.resources }] : []), [{ paymentFor: 'occupation', resources: { food: 1 } }, { paymentFor: 'cardEffect', resources: { food: 4 } }])
  })
})
