import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

describe('ae-negative-51-family', () => {
  const { sessions, options, gains, save, setup, choose, finish, completeRound, offer } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E126 N1 natural next round in stone house grants one chosen resource with all four exact alternatives', () => {
    for (const [key, count] of [['wood', 2], ['clay', 2], ['reed', 1], ['stone', 1]] as const) {
      const s = setup('E126_TaxCollector', 5, state => state.players[0]!.houseType = 'stone')
      let r = completeRound(s, ['grain-seeds', 'forest', 'reed-bank', 'clay-pit'])
      r = offer(s, r, 'E126_TaxCollector')
      if (!options(r).some(o => gains(o, key) === count))
        r = choose(s, r, o => !['__skip__', '__pass__'].includes(o.value))
      r = choose(s, r, o => gains(o, key === 'wood' || key === 'clay' || key === 'reed' || key === 'stone' ? key : 'food') === count)
      r = finish(s, r)
      assert.equal(r.state.round, 6)
      assert.equal(r.state.players[0]!.resources[key], key === 'reed' ? 3 : count)
      save(`E126-N1-${key}`, r)
    }
  })
  it('E126 N2 wood clay hand-only and optional decline give no Tax Collector round-start reward', () => {
    for (const mode of ['wood', 'clay', 'hand', 'decline']) {
      const s = setup('E126_TaxCollector', 5, state => {
        state.players[0]!.houseType = mode === 'clay' ? 'clay' : mode === 'wood' ? 'wood' : 'stone'
        if (mode === 'hand') {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['E126_TaxCollector']
        }
      })
      const r = finish(s, completeRound(s, ['grain-seeds', 'forest', 'reed-bank', 'clay-pit']))
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.resources.clay, 0)
      assert.equal(r.state.players[0]!.resources.stone, 0)
      assert.equal(r.state.players[0]!.resources.reed, 2)
      save(`E126-N2-${mode}`, r)
    }
  })
})
