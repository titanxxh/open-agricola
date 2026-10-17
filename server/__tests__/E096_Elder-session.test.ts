import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { workersAtHome } from '../../shared/domain/player'
import { assertRejectedUnchanged, passPreparationExchanges } from './_helpers/negative-rule-audit'
import { createOpeningSession } from './_helpers/session-fixtures'
import * as audit45Phase from './_helpers/audit/ae-negative-45-phase'

describe('ae-negative-45-phase', () => {
  const { sessions, save, setup, choice, turn } = audit45Phase
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E096 N1 fresh round one opening accepts free Elder without changing resources workers or occupying a space', () => { const s = createOpeningSession({ seed: 12, options: { playerCount: 2, deckIds: ['E'] }, expected: { phase: 'playing', roundPhase: 'preparation', interaction: { stateId: 'wait' } } }); sessions.push(s); for (const [index, p] of s.state.players.entries()) {
    p.occupationHand = index === 0 ? ['E096_Elder'] : ['__test_placeholder__']
    p.minorHand = ['__test_placeholder__']
  } const before = structuredClone(s.state.players[0]!.resources); let r = s.getState(); for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
    r = passPreparationExchanges(s, r)
    if (r.interaction.stateId !== 'wait')
      break
    r = choice(s, r, o => !['__skip__', '__pass__', '__done__'].includes(o.value) && o.labelKey !== 'actions.exchange.name')
  } assert.deepEqual(r.state.players[0]!.occupationPlayed, ['E096_Elder']); assert.deepEqual(r.state.players[0]!.resources, before); assert.equal(workersAtHome(r.state, r.state.players[0]!).length, 2); assert.ok(r.state.actionSpaces.every(a => a.takenBy.length === 0)); save('E096-N1', r); })
  it('E096 N2 later round has no free offer but legal Lessons still plays Elder', () => { const s = setup('E096_Elder', 2, state => { state.players[0]!.occupationPlayed = []; state.players[0]!.occupationHand = ['E096_Elder']; }); assert.equal(s.getState().interaction.stateId, 'idle'); const reject = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E096_Elder')); assert.equal(reject.state.players[0]!.occupationPlayed.length, 0); let r = turn(s, 'lessons'); if (r.state.players[0]!.occupationHand.includes('E096_Elder'))
    r = choice(s, r, o => o.value === 'E096_Elder'); assert.deepEqual(r.state.players[0]!.occupationPlayed, ['E096_Elder']); assert.equal(workersAtHome(r.state, r.state.players[0]!).length, 1); save('E096-N2', r); })
  it('E096 N3 declining fresh opening preserves hand resources and all home people', () => { const s = createOpeningSession({ seed: 12, options: { playerCount: 2, deckIds: ['E'] }, expected: { phase: 'playing', roundPhase: 'preparation', interaction: { stateId: 'wait' } } }); sessions.push(s); for (const [index, p] of s.state.players.entries()) {
    p.occupationHand = index === 0 ? ['E096_Elder'] : ['__test_placeholder__']
    p.minorHand = ['__test_placeholder__']
  } let r = s.getState(); for (let n = 0; n < 4 && r.interaction.stateId === 'wait'; n++) {
    r = passPreparationExchanges(s, r)
    if (r.interaction.stateId === 'wait')
      r = choice(s, r, o => ['__skip__', '__pass__'].includes(o.value))
  } assert.deepEqual(r.state.players[0]!.occupationHand, ['E096_Elder']); assert.equal(r.state.players[0]!.occupationPlayed.length, 0); assert.equal(workersAtHome(r.state, r.state.players[0]!).length, 2); assert.equal(r.state.players[0]!.resources.food, 2); save('E096-N3', r); })
})
