import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { confirmNext } from './_helpers/negative-rule-audit'
import * as audit48Crops from './_helpers/audit/ae-negative-48-crops'

describe('ae-negative-48-crops', () => {
  const { sessions, ok, save, setup, finish, next } = audit48Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D111 N1 actual renovation schedules only next six rounds and late round twelve truncates at fourteen', () => {
    for (const round of [8, 12]) {
      const s = setup('D111_InteriorDecorator', round, state => { Object.assign(state.players[0]!.resources, { clay: 2, reed: 1 }); })
      const r = finish(s, ok(s.takeAction(0, 'house-redevelopment')))
      assert.equal(r.state.players[0]!.houseType, 'clay')
      assert.equal(r.state.players[0]!.resources.clay, 0)
      assert.equal(r.state.players[0]!.resources.reed, 0)
      assert.deepEqual(r.state.futureMeeples.filter(f => f.cardId === 'D111_InteriorDecorator').map(f => ({ round: f.round, food: f.resources.food })), Array.from({ length: round === 8 ? 6 : 2 }, (_, n) => ({ round: round + n + 1, food: 1 })))
      save(`D111-N1-${round}`, r)
    }
  })
  it('D111 N2 natural next round delivers exactly one scheduled food while unrelated Forest creates no future', () => {
    const s = setup('D111_InteriorDecorator', 8, state => Object.assign(state.players[0]!.resources, { clay: 2, reed: 1 }))
    finish(s, ok(s.takeAction(0, 'house-redevelopment')))
    next(s)
    finish(s, ok(s.takeAction(1, 'forest')))
    next(s)
    finish(s, ok(s.takeAction(0, 'reed-bank')))
    next(s)
    let r = ok(s.takeAction(1, 'clay-pit'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    r = finish(s, r)
    assert.equal(r.state.round, 9)
    assert.equal(r.state.players[0]!.resources.food, 21)
    assert.deepEqual(r.state.futureMeeples.filter(f => f.cardId === 'D111_InteriorDecorator').map(f => f.round), [10, 11, 12, 13, 14])
    save('D111-N2', r)
    const ss = setup('D111_InteriorDecorator', 8), unrelated = finish(ss, ok(ss.takeAction(0, 'forest')))
    assert.equal(unrelated.state.futureMeeples.filter(f => f.cardId === 'D111_InteriorDecorator').length, 0)
    save('D111-N2-unrelated', unrelated)
  })
})
