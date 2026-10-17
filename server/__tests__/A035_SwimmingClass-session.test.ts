import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { familySize, newbornCount } from '../../shared/domain/player'
import { confirmNext } from './_helpers/negative-rule-audit'
import * as audit06Future from './_helpers/audit/ae-negative-06-future'

describe('ae-negative-06-future', () => {
  const { SWIM, sessions, setup, buy, deny, score, vp, turn, swimSetup, roundWithGrowth } = audit06Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A035 N1 actual purchase requires two occupations and pays one food', () => {
    deny(setup(SWIM, { occupations: 1, resources: { food: 1 } }), SWIM); deny(setup(SWIM, { resources: { food: 0 } }), SWIM)
    const r = buy(setup(SWIM), SWIM); assert.ok(r.state.players[0]!.minorPlayed.includes(SWIM)); assert.equal(r.state.players[0]!.resources.food, 39)
  })
  it('A035 N2 actual Fishing and newborn reward only at natural return home', () => {
    const r = roundWithGrowth(swimSetup()); assert.equal(r.state.round, 6); assert.equal(vp(r, SWIM), 2); assert.equal(score(r, SWIM), 2); assert.equal(familySize(r.state.players[0]!), 3); assert.equal(newbornCount(r.state.players[0]!), 0)
  })
  it('A035 N3 actual newborn with no own Fishing cannot inherit opponent Fishing reward', () => {
    for (const opponentSpace of ['forest', 'fishing']) {
      const r = roundWithGrowth(swimSetup(), 'grain-seeds', opponentSpace); assert.equal(r.state.round, 6); assert.equal(vp(r, SWIM), 0); assert.equal(score(r, SWIM), 0); assert.equal(familySize(r.state.players[0]!), 3)
    }
  })
  it('A035 N4 Fishing without newborn and prior round Fishing do not award next round growth', () => {
    const s = swimSetup(); turn(s, 0, 'fishing'); turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds'); const first = confirmNext(s, turn(s, 1, 'clay-pit'))
    assert.equal(first.state.round, 6); assert.equal(vp(first, SWIM), 0); assert.equal(familySize(first.state.players[0]!), 2)
    const r = roundWithGrowth(s, 'grain-seeds'); assert.equal(r.state.round, 7); assert.equal(vp(r, SWIM), 0); assert.equal(score(r, SWIM), 0); assert.equal(familySize(r.state.players[0]!), 3)
  })
})
