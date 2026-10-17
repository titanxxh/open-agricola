import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

describe('ae-negative-54-resources', () => {
  const { sessions, ok, save, setup, finish, next, completeRound, move, farm } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D147 N1 actual Day Laborer markers deliver on three natural round starts', () => {
    const s = setup('D147_TrapBuilder', 5, state => farm(state, 0))
    let r = move(s, 'day-laborer')
    assert.equal(r.state.players[0]!.resources.food, 22)
    assert.deepEqual(r.state.futureMeeples.map(m => ({ round: m.round, resources: m.resources })), [{ round: 6, resources: { food: 1 } }, { round: 7, resources: { food: 1 } }, { round: 8, resources: { boar: 1 } }])
    r = finish(s, completeRound(s, ['forest', 'clay-pit', 'reed-bank', 'fishing', 'grain-seeds']))
    assert.equal(r.state.round, 6)
    assert.equal(r.state.players[0]!.resources.food, 23)
    save('D147-N1-6', r)
    r = finish(s, completeRound(s, ['forest', 'clay-pit', 'reed-bank', 'grove', 'fishing', 'grain-seeds']))
    assert.equal(r.state.round, 7)
    assert.equal(r.state.players[0]!.resources.food, 24)
    save('D147-N1-7', r)
    r = finish(s, completeRound(s, ['forest', 'clay-pit', 'reed-bank', 'grove', 'fishing', 'grain-seeds']))
    assert.equal(r.state.round, 8)
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    assert.equal(r.state.futureMeeples.length, 0)
    save('D147-N1-8', r)
  })
  it('D147 N2 endgame clipping and opponent unrelated hand exclusions prevent extra markers', () => {
    for (const [round, mode] of [[13, 'owner'], [14, 'owner'], [5, 'unrelated'], [5, 'opponent'], [5, 'hand']] as const) {
      const s = setup('D147_TrapBuilder', round, state => {
        if (mode === 'hand') {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['D147_TrapBuilder']
        }
      })
      if (mode === 'opponent') {
        move(s, 'forest')
        next(s)
      }
      const r = finish(s, ok(s.takeAction(mode === 'opponent' ? 1 : 0, mode === 'unrelated' ? 'forest' : 'day-laborer')))
      assert.deepEqual(r.state.futureMeeples.map(m => ({ round: m.round, resources: m.resources })), mode === 'owner' && round === 13 ? [{ round: 14, resources: { food: 1 } }] : [])
      save(`D147-N2-${round}-${mode}`, r)
    }
  })
})
