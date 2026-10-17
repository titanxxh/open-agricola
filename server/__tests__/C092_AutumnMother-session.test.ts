import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { familySize } from '../../shared/domain/player'
import { confirmNext, passPreparationExchanges } from './_helpers/negative-rule-audit'
import * as audit45Phase from './_helpers/audit/ae-negative-45-phase'

describe('ae-negative-45-phase', () => {
  const { sessions, save, setup, choice, finish, turn, completeRound, requestOf } = audit45Phase
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C092 N1 real harvest accepts three food growth and decline preserves family and exact fee', () => { for (const accept of [true, false]) {
    const s = setup('C092_AutumnMother', 4, state => { const p = state.players[0]!; p.rooms = 3; p.roomTiles.push({ row: 0, col: 0 }); })
    let r = completeRound(s)
    r = passPreparationExchanges(s, r)
    if (requestOf(r).kind === 'select-trigger')
      r = choice(s, r, o => o.value === 'C092_AutumnMother')
    r = choice(s, r, o => accept ? !['__skip__', '__done__', '__pass__'].includes(o.value) : o.value === '__skip__')
    assert.equal(familySize(r.state.players[0]!), accept ? 3 : 2)
    assert.equal(r.state.players[0]!.resources.food, accept ? 12 : 16)
    save(`C092-N1-${accept}`, r)
  } })
  it('C092 N2 no free room or insufficient three food cannot create newborn and unrelated work never grows', () => { for (const mode of ['room', 'food']) {
    const s = setup('C092_AutumnMother', 4, state => { if (mode === 'food') {
      state.players[0]!.rooms = 3
      state.players[0]!.roomTiles.push({ row: 0, col: 0 })
      state.players[0]!.resources.food = 2
    } })
    const before = turn(s, 'grain-seeds')
    assert.equal(familySize(before.state.players[0]!), 2)
    finish(s, before)
    finish(s, turn(s, 'clay-pit'))
    finish(s, turn(s, 'forest'))
    let r = finish(s, turn(s, 'reed-bank'))
    if (requestOf(r).kind === 'confirm-next-player')
      r = confirmNext(s, r)
    r = finish(s, r)
    assert.equal(familySize(r.state.players[0]!), 2)
    assert.ok(!r.state.log.some(e => e.key === 'log.familyGrowth'))
    save(`C092-N2-${mode}`, r)
  } })
})
