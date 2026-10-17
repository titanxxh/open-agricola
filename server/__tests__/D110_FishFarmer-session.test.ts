import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit48Crops from './_helpers/audit/ae-negative-48-crops'

describe('ae-negative-48-crops', () => {
  const { sessions, ok, save, setup, finish, next } = audit48Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D110 N1 exact Fishing pile selects Reed Bank Clay Pit or Forest with boundary zero and four', () => {
    for (const fishing of [0, 1, 2, 3, 4])
      for (const [space, key] of [['reed-bank', 'reed'], ['clay-pit', 'clay'], ['forest', 'wood']] as const) {
        const s = setup('D110_FishFarmer', 14, state => { state.actionSpaces.find(a => a.id === 'fishing')!.resources.food = fishing; state.actionSpaces.find(a => a.id === space)!.resources[key] = 1; })
        const r = finish(s, ok(s.takeAction(0, space)))
        const trigger = (fishing === 1 && space === 'reed-bank') || (fishing === 2 && space === 'clay-pit') || (fishing >= 3 && space === 'forest')
        assert.equal(r.state.players[0]!.resources.food, trigger ? 22 : 20)
        assert.equal(r.state.players[0]!.resources[key], 1)
        assert.equal(r.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, fishing)
        save(`D110-N1-${fishing}-${space}`, r)
      }
  })
  it('D110 N2 hand only and actual opponent qualifying placement grant owner no extra food', () => {
    for (const played of [true, false]) {
      const s = setup('D110_FishFarmer', 14, state => {
        if (!played) {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['D110_FishFarmer']
        }
        state.actionSpaces.find(a => a.id === 'fishing')!.resources.food = 3
      })
      finish(s, ok(s.takeAction(0, played ? 'grain-seeds' : 'forest')))
      if (played) {
        next(s)
        finish(s, ok(s.takeAction(1, 'forest')))
      }
      const r = ok(s.getState())
      assert.equal(r.state.players[0]!.resources.food, 20)
      assert.equal(r.state.players[1]!.resources.food, 20)
      save(`D110-N2-${played}`, r)
    }
  })
})
