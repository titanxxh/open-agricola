import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

describe('ae-negative-54-resources', () => {
  const { sessions, ok, save, setup, finish, next, play, take, move } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C144 N1 real play gives reed only in three players and opponent renovation rewards owner', () => {
    for (const players of [3, 4]) {
      const s = setup('C144_ReedRoofRenovator', 14, () => { }, players)
      const r = finish(s, play(s, 'C144_ReedRoofRenovator'))
      assert.equal(r.state.players[0]!.resources.reed, players === 3 ? 1 : 0)
      save(`C144-N1-play-${players}`, r)
    }
    const s = setup('C144_ReedRoofRenovator', 14, state => Object.assign(state.players[1]!.resources, { clay: 2, reed: 1 }))
    move(s, 'forest')
    next(s)
    const r = finish(s, ok(s.takeAction(1, 'house-redevelopment')))
    assert.equal(r.state.players[1]!.houseType, 'clay')
    assert.equal(r.state.players[1]!.resources.clay, 0)
    assert.equal(r.state.players[0]!.resources.reed, 1)
    save('C144-N1-reno', r)
  })
  it('C144 N2 own renovation unrelated opponent work and hand-only card give no owner reed', () => {
    for (const mode of ['own', 'unrelated', 'hand']) {
      const s = setup('C144_ReedRoofRenovator', 14, state => {
        Object.assign(state.players[mode === 'hand' ? 1 : 0]!.resources, { clay: 2, reed: 1 })
        if (mode === 'hand') {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['C144_ReedRoofRenovator']
        }
      })
      let r
      if (mode === 'hand') {
        move(s, 'forest')
        next(s)
        r = finish(s, ok(s.takeAction(1, 'house-redevelopment')))
      }
      else
        r = finish(s, take(s, mode === 'own' ? 'house-redevelopment' : 'forest'))
      assert.equal(r.state.players[0]!.resources.reed, mode === 'unrelated' ? 1 : 0)
      save(`C144-N2-${mode}`, r)
    }
  })
})
