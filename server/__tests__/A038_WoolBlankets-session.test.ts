import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit07Scoring from './_helpers/audit/ae-negative-07-scoring'

describe('ae-negative-07-scoring', () => {
  const { WOOL, sessions, ok, options, buy, denied, bonus, renovate, housing, wool } = audit07Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A038 N1 four sheep reject forged purchase and five legally housed sheep buy for free once', () => { denied(wool({ sheep: 4 }), WOOL); const s = wool(); const r = buy(s, WOOL); assert.equal(r.state.players[0]!.resources.sheep, 5); assert.equal(r.state.players[0]!.resources.food, 20); assert.equal(bonus(r, WOOL), 3); assertRejectedUnchanged(s, () => s.resolveChoice(0, WOOL)) })
  it('A038 N2 pasture house and loose stable sheep jointly meet the exact five threshold', () => { const s = wool({ mixed: true }); const r = buy(s, WOOL); assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 3); assert.equal(countRoomAnimals(r.state.players[0]!), 1); assert.equal(Object.values(r.state.players[0]!.stableAnimals ?? {}).filter(x => x.animalType === 'sheep').length, 1); assert.equal(bonus(r, WOOL), 3) })
  it('A038 N3 opponent sheep and controlled unallocated supply cannot satisfy owner board prerequisite', () => {
    denied(wool({ sheep: 0 }, state => housing(state, 5, 1)), WOOL)
    denied(wool({ sheep: 0 }, state => { state.players[0]!.resources.sheep = 5 }), WOOL)
  })
  it('A038 N4 literal wooden clay stone bonuses are stable under repeated score reads', () => { for (const [house, expected] of [['wood', 3], ['clay', 2], ['stone', 0]] as const) { const s = wool({ played: true }, state => { state.players[0]!.houseType = house }); assert.equal(bonus(s.getState(), WOOL), expected); assert.equal(bonus(s.getState(), WOOL), expected) } })
  it('A038 N5 card in hand and only opponent played card grant no owner bonus', () => { assert.equal(bonus(wool().getState(), WOOL), 0); const s = wool({}, state => { state.players[0]!.minorHand = ['__test_placeholder__']; state.players[1]!.minorPlayed = [WOOL]; housing(state, 5, 1) }); assert.equal(bonus(s.getState(), WOOL), 0); assert.equal(bonus(s.getState(), WOOL, 1), 3) })
  it('A038 N6 actual cooking removes sheep without revoking card then actual renovation reduces bonus', () => {
    const s = wool({ played: true }, state => { state.players[0]!.improvements = ['Major_Fireplace1']; Object.assign(state.players[0]!.resources, { clay: 2, reed: 1 }) }); const menu = ok(s.takeAnytimeAction(0, 'exchange')); const c = options(menu).find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.sheep === 5); assert(c, JSON.stringify(menu.interaction)); assert(c.value.startsWith('trade:'))
    const cooked = ok(s.resolveChoice(0, `bulk:${c.value.split(':')[1]}=5`)); assert.equal(cooked.state.players[0]!.resources.sheep, 0); assert.equal(cooked.state.players[0]!.resources.food, 30); assert.equal(bonus(cooked, WOOL), 3)
    const r = renovate(s); assert.equal(r.state.players[0]!.houseType, 'clay'); assert.equal(bonus(r, WOOL), 2)
  })
  it('A038 N7 actual free purchase and renovation each support whole action undo and retry', () => {
    const s = wool(); const before = undoRuleSnapshot(s.getState()); assert.equal(bonus(buy(s, WOOL), WOOL), 3); assertUndoRestored(before, s.undoAction()); assert.equal(bonus(buy(s, WOOL), WOOL), 3)
    const reno = wool({ played: true }, state => Object.assign(state.players[0]!.resources, { clay: 2, reed: 1 })); const snapshot = undoRuleSnapshot(reno.getState()); assert.equal(bonus(renovate(reno), WOOL), 2); assertUndoRestored(snapshot, reno.undoAction()); assert.equal(bonus(renovate(reno), WOOL), 2)
  })
})
