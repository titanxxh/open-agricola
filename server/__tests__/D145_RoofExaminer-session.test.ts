import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'

describe('ae-negative-54-resources', () => {
  const { sessions, save, setup, finish, play, move } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D145 N1 real occupation play counts zero through four owned major improvements', () => {
    for (const n of [0, 1, 2, 3, 4]) {
      const s = setup('D145_RoofExaminer', 14, state => state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2', 'Major_Joinery', 'Major_Pottery'].slice(0, n))
      const r = finish(s, play(s, 'D145_RoofExaminer'))
      assert.equal(r.state.players[0]!.resources.reed, n === 0 ? 0 : n + 1)
      save(`D145-N1-${n}`, r)
    }
  })
  it('D145 N2 minor improvements major hand cards and later ordinary work do not count', () => {
    const s = setup('D145_RoofExaminer', 14, state => { state.players[0]!.minorPlayed = ['A001_Bookcase']; state.players[0]!.minorHand = ['B007_Wage']; })
    let r = finish(s, play(s, 'D145_RoofExaminer'))
    assert.equal(r.state.players[0]!.resources.reed, 0)
    move(s, 'forest')
    move(s, 'reed-bank')
    r = move(s, 'clay-pit')
    assert.equal(r.state.players[0]!.resources.reed, 0)
    save('D145-N2', r)
  })
})
