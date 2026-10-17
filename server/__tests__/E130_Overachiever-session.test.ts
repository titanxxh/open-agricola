import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { familySize } from '../../shared/domain/player'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

describe('ae-negative-51-family', () => {
  const { sessions, save, setup, finish, next, lesson, improvement, offer, take } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E130 N1 Wish action improvement discount happens before ordinary and urgent growth with optional decline', () => {
    for (const space of ['wish-children', 'urgent-wish-children'])
      for (const accept of [true, false]) {
        const s = setup('E130_Overachiever', 14, state => {
          state.players[0]!.resources.clay = 1
          if (space === 'wish-children') {
            state.players[0]!.rooms = 3
            state.players[0]!.roomTiles.push({ row: 0, col: 0 })
          }
        })
        let r = offer(s, take(s, space), 'E130_Overachiever')
        if (accept) {
          assert.equal(familySize(r.state.players[0]!), 2)
          r = improvement(s, r, 'Major_Fireplace1')
        }
        r = finish(s, r)
        assert.equal(familySize(r.state.players[0]!), 3)
        assert.equal(r.state.players[0]!.resources.clay, accept ? 0 : 1)
        assert.equal(r.state.players[0]!.improvements.includes('Major_Fireplace1'), accept)
        save(`E130-N1-${space}-${accept}`, r)
      }
  })
  it('E130 N2 ordinary major action keeps full cost and unrelated plus real opponent growth give no owner extra improvement', () => {
    for (const mode of ['major', 'unrelated', 'opponent']) {
      const s = setup('E130_Overachiever', 14, state => { state.players[0]!.resources.clay = 2; state.players[0]!.minorHand = ['B007_Wage']; state.players[1]!.rooms = 3; state.players[1]!.roomTiles.push({ row: 0, col: 0 }); })
      let r = mode === 'major' ? improvement(s, take(s, 'major-improvement'), 'Major_Fireplace1') : take(s, 'forest')
      r = finish(s, r)
      if (mode === 'opponent') {
        next(s)
        r = finish(s, take(s, 'wish-children'))
      }
      assert.equal(r.state.players[0]!.resources.clay, mode === 'major' ? 0 : 2)
      assert.ok(!r.state.players[0]!.minorPlayed.includes('B007_Wage'))
      save(`E130-N2-${mode}`, r)
    }
  })
  it('E130 N3 no-room growth granted by Lover is not a Wish action space and cannot play discounted extra improvement', () => { const s = setup('E130_Overachiever', 10, state => { state.players[0]!.occupationHand = ['C127_Lover']; state.players[0]!.minorHand = ['B007_Wage']; state.players[0]!.resources.food = 5; }); const r = finish(s, lesson(s, 'C127_Lover'), true); assert.equal(familySize(r.state.players[0]!), 3); save('E130-N3', r); assertRuleOutcome({ food: r.state.players[0]!.resources.food, hand: r.state.players[0]!.minorHand }, { food: 0, hand: ['B007_Wage'] }); })
})
