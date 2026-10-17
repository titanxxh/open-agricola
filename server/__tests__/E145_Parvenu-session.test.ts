import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

describe('ae-negative-54-resources', () => {
  const { sessions, gains, save, setup, choose, finish, play, take } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E145 N1 real round seven play doubles exactly the selected clay or reed supply', () => {
    for (const key of ['clay', 'reed'] as const) {
      const s = setup('E145_Parvenu', 7, state => Object.assign(state.players[0]!.resources, { clay: 2, reed: 3 }))
      let r = play(s, 'E145_Parvenu')
      r = choose(s, r, o => gains(o, key) === (key === 'clay' ? 2 : 3))
      assert.equal(r.state.players[0]!.resources.clay, key === 'clay' ? 4 : 2)
      assert.equal(r.state.players[0]!.resources.reed, key === 'reed' ? 6 : 3)
      save(`E145-N1-${key}`, r)
    }
  })
  it('E145 N2 round eight zero supply single category and hand-only work boundaries', () => {
    for (const mode of ['late', 'zero', 'clay', 'reed', 'hand']) {
      const s = setup('E145_Parvenu', mode === 'late' ? 8 : 7, state => Object.assign(state.players[0]!.resources, { clay: ['late', 'clay', 'hand'].includes(mode) ? 2 : 0, reed: ['late', 'reed', 'hand'].includes(mode) ? 3 : 0 }))
      const r = mode === 'hand' ? (s.state.players[0]!.occupationPlayed = [], s.state.players[0]!.occupationHand = ['E145_Parvenu'], s.loadState(s.state), finish(s, take(s, 'forest'))) : finish(s, play(s, 'E145_Parvenu'), true)
      assert.equal(r.state.players[0]!.resources.clay, mode === 'clay' ? 4 : ['late', 'hand'].includes(mode) ? 2 : 0)
      assert.equal(r.state.players[0]!.resources.reed, mode === 'reed' ? 6 : ['late', 'hand'].includes(mode) ? 3 : 0)
      save(`E145-N2-${mode}`, r)
    }
  })
})
