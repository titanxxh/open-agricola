import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit48Crops from './_helpers/audit/ae-negative-48-crops'

describe('ae-negative-48-crops', () => {
  const { sessions, save, setup, finish, completeRound } = audit48Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C111 N1 natural upcoming round six tests equality plus one and minus one thresholds', () => {
    for (const food of [5, 6, 7]) {
      const s = setup('C111_SmallAnimalBreeder', 5, state => state.players[0]!.resources.food = food)
      const r = finish(s, completeRound(s, ['grain-seeds', 'forest', 'reed-bank', 'clay-pit']))
      assert.equal(r.state.round, 6)
      assert.equal(r.state.players[0]!.resources.food, food >= 6 ? food + 1 : food)
      assert.equal(r.state.players[1]!.resources.food, 20)
      save(`C111-N1-${food}`, r)
    }
  })
  it('C111 N2 card only in hand gives no pre-round bonus and real unrelated work does not grant it early', () => { const s = setup('C111_SmallAnimalBreeder', 5, state => { state.players[0]!.occupationPlayed = []; state.players[0]!.occupationHand = ['C111_SmallAnimalBreeder']; state.players[0]!.resources.food = 6; }); const r = finish(s, completeRound(s, ['grain-seeds', 'forest', 'reed-bank', 'clay-pit'])); assert.equal(r.state.round, 6); assert.equal(r.state.players[0]!.resources.food, 6); save('C111-N2', r); })
})
