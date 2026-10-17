import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

describe('ae-negative-51-family', () => {
  const { sessions, save, setup, finish, completeRound, build, offer } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D130 N1 natural work-phase end builds usual paid room without another placement when Meeting Place was unused', () => { const s = setup('D130_RecreationalCarpenter', 5, state => Object.assign(state.players[0]!.resources, { wood: 5, reed: 2 })); let r = offer(s, completeRound(s), 'D130_RecreationalCarpenter'); assert.equal(r.state.actionSpaces.flatMap(a => a.takenBy).filter(w => w.playerId === r.state.players[0]!.id).length, 2); r = build(s, r); assert.equal(r.state.players[0]!.rooms, 3); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.reed, 0); assert.equal(r.state.events.filter(e => e.type === 'worker.placed').length, 6); save('D130-N1-before-return', r); r = finish(s, r); assert.equal(r.state.round, 6); save('D130-N1', r); })
  it('D130 N2 own Meeting Place suppresses build while opponent Meeting Place does not and decline spends nothing', () => {
    for (const mode of ['own', 'opponent', 'decline', 'short']) {
      const s = setup('D130_RecreationalCarpenter', 5, state => Object.assign(state.players[0]!.resources, { wood: mode === 'short' ? 4 : 5, reed: 2 }))
      const spaces = mode === 'own' ? ['meeting-place', 'forest', 'reed-bank', 'fishing', 'grain-seeds', 'day-laborer'] : mode === 'opponent' ? ['clay-pit', 'meeting-place', 'reed-bank', 'fishing', 'grain-seeds', 'day-laborer'] : undefined
      let r = completeRound(s, spaces)
      if (mode === 'opponent')
        r = build(s, offer(s, r, 'D130_RecreationalCarpenter'))
      r = finish(s, r)
      assert.equal(r.state.players[0]!.rooms, mode === 'opponent' ? 3 : 2)
      assert.equal(r.state.players[0]!.resources.wood, mode === 'opponent' ? 0 : mode === 'short' ? 4 : 5)
      assert.equal(r.state.players[0]!.resources.reed, mode === 'opponent' ? 0 : 2)
      save(`D130-N2-${mode}`, r)
    }
  })
})
