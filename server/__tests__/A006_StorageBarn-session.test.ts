import '../../shared/cards/A/A006_StorageBarn'
import '../../shared/cards/A/A008_FoodBasket'
import '../../shared/cards/A/A009_YoungAnimalMarket'
import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit04Immediate from './_helpers/audit/ae-negative-04-immediate'

describe('ae-negative-04-immediate', () => {
  const { BARN, MAJORS, sessions, setup, options, enter, buy, passed, resources, ZERO, noRepeat } = audit04Immediate
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A006 N1 all sixteen own major subsets grant only their corresponding resources', () => {
    const expected = [[0,0,0,0],[1,0,0,0],[0,1,0,0],[1,1,0,0],[0,0,1,0],[1,0,1,0],[0,1,1,0],[1,1,1,0],[0,0,0,1],[1,0,0,1],[0,1,0,1],[1,1,0,1],[0,0,1,1],[1,0,1,1],[0,1,1,1],[1,1,1,1]]
    for (let mask = 0; mask < 16; mask++) {
      const s = setup(BARN, { ownMajors: MAJORS.filter((_, i) => mask & (1 << i)) })
      assert.deepEqual(resources(s.getState()), ZERO)
      const offer = enter(s)
      assert.deepEqual(resources(offer), ZERO)
      const r = buy(s, offer, BARN)
      passed(r, BARN)
      assert.deepEqual([r.state.players[0]!.resources.stone,r.state.players[0]!.resources.wood,r.state.players[0]!.resources.clay,r.state.players[0]!.resources.reed], expected[mask])
      noRepeat(s, BARN)
    }
  })
  it('A006 N2 opponent named majors and own Fireplace grant no matching resource', () => {
    const s = setup(BARN, { ownMajors: ['Major_Fireplace1'], opponentMajors: MAJORS })
    const r = buy(s, enter(s), BARN)
    passed(r, BARN)
    assert.deepEqual(resources(r), ZERO)
    assert.deepEqual(r.state.players[1]!.resources.wood, 0)
  })
  it('A006 N3 opponent hand purchase is rejected before a legal free retry', () => {
    const s = setup(BARN, { ownMajors: MAJORS, inHand: false })
    const r = enter(s)
    assert.equal(options(r).some(o => o.value === BARN), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, BARN))
    const retry = buy(s, r, 'A054_Credit')
    assert.deepEqual(resources(retry), ZERO)
    assert.equal(retry.state.players[0]!.resources.food, 5)
  })
  it('A006 N4 undo restores resources hand and worker before a single legal retry', () => {
    const s = setup(BARN, { ownMajors: MAJORS })
    const before = undoRuleSnapshot(s.getState())
    passed(buy(s, enter(s), BARN), BARN)
    assertUndoRestored(before, s.undoAction())
    const r = buy(s, enter(s), BARN)
    assert.deepEqual(resources(r), { ...ZERO, stone: 1, wood: 1, clay: 1, reed: 1 })
    passed(r, BARN)
  })
})
