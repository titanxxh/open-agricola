import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { passPreparationExchanges } from './_helpers/negative-rule-audit'
import * as audit45Phase from './_helpers/audit/ae-negative-45-phase'

describe('ae-negative-45-phase', () => {
  const { sessions, save, setup, choice, finish, completeRound, requestOf } = audit45Phase
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C097 N1 real opposite owners return both seed people and receive two food with optional free occupation', () => { for (const accept of [true, false]) {
    const s = setup('C097_SeedResearcher', 9, state => state.players[0]!.occupationHand = ['A125_Priest'])
    let r = completeRound(s, true)
    r = passPreparationExchanges(s, r)
    if (requestOf(r).kind === 'select-trigger')
      r = choice(s, r, o => o.value === 'C097_SeedResearcher')
    r = choice(s, r, o => JSON.stringify(o).includes('actions.lessons.name') === accept)
    if (accept && r.state.players[0]!.occupationHand.includes('A125_Priest'))
      r = choice(s, r, o => o.value === 'A125_Priest')
    assert.equal(r.state.players[0]!.resources.food, 18)
    assert.equal(r.state.players[0]!.occupationPlayed.includes('A125_Priest'), accept)
    assert.equal(r.state.players[1]!.resources.food, 16)
    save(`C097-N1-${accept}`, r)
  } })
  it('C097 N2 real single seed return gives zero food bonus and preserves occupation hand', () => { const s = setup('C097_SeedResearcher', 9, state => state.players[0]!.occupationHand = ['A125_Priest']); const r = finish(s, completeRound(s)); assert.equal(r.state.players[0]!.resources.food, 16); assert.deepEqual(r.state.players[0]!.occupationHand, ['A125_Priest']); save('C097-N2', r); })
})
