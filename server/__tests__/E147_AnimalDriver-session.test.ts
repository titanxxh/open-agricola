import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

describe('ae-negative-54-resources', () => {
  const { sessions, save, setup, finish, completeRound, farm } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E147 N1 natural harvest counts one through four finite fenced stables and awards one animal', () => {
    for (const n of [0, 1, 2, 3, 4]) {
      const s = setup('E147_AnimalDriver', 4, state => farm(state, n))
      let r = completeRound(s)
      r = finish(s, r)
      assert.equal(r.state.round, 5)
      for (const key of ['sheep', 'boar', 'cattle'] as const)
        assert.equal(r.state.players[0]!.resources[key], key === (n === 1 ? 'sheep' : n === 2 ? 'boar' : n >= 3 ? 'cattle' : 'none') ? 1 : 0)
      assert.equal(r.state.players[0]!.stableTiles.length, n)
      save(`E147-N1-${n}`, r)
    }
  })
  it('E147 N2 unfenced stables nonharvest work and hand-only card give no animal', () => {
    for (const mode of ['unfenced', 'nonharvest', 'hand']) {
      const s = setup('E147_AnimalDriver', mode === 'nonharvest' ? 5 : 4, state => {
        farm(state, 4, mode !== 'unfenced')
        if (mode === 'hand') {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['E147_AnimalDriver']
        }
      })
      const r = finish(s, completeRound(s))
      assert.equal(r.state.players[0]!.resources.sheep + r.state.players[0]!.resources.boar + r.state.players[0]!.resources.cattle, 0)
      save(`E147-N2-${mode}`, r)
    }
  })
})
