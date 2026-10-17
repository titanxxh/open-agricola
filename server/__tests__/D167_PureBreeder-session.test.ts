import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit58Livestock from './_helpers/audit/ae-negative-58-livestock'

describe('ae-negative-58-livestock', () => {
  const { sessions, ok, save, make, pasture, finish, transition, play, count } = audit58Livestock
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D167 N1 actual first Lessons grants exactly one immediate wood and undo removes it before replay', () => {
    const session = make('D167_PureBreeder', undefined, false)
    const response = finish(session, play(session, 'D167_PureBreeder'))
    assert.equal(response.state.players[0]!.resources.wood, 1)
    const undone = ok(session.undoAction())
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert.ok(undone.state.players[0]!.occupationHand.includes('D167_PureBreeder'))
    const replay = finish(session, play(session, 'D167_PureBreeder'))
    assert.equal(replay.state.players[0]!.resources.wood, 1)
    save('D167-N1', { response, undone, replay })
  })
  it('D167 N2 after natural nonharvest round end two sheep breed one sheep which must be housed before work resumes', () => {
    const session = make('D167_PureBreeder', state => pasture(state.players[0]!, 'sheep', 2, true))
    const response = transition(session, 6, true)
    save('D167-N2', response)
    assert.deepEqual(count(response), [3, 0, 0])
    const housed = response.state.players[0]!.pastures[0]!.animalCount + Object.values(response.state.players[0]!.houseAnimals).filter(animal => animal === 'sheep').length
    assertRuleOutcome(housed, 3)
  })
  it('D167 N3 single parent full capacity and card only in hand cannot grant nonharvest offspring', () => {
    for (const [parents, stable, played] of [[1, true, true], [2, false, true], [2, true, false]] as const) {
      const session = make('D167_PureBreeder', state => {
        const owner = state.players[0]!
        pasture(owner, 'sheep', parents, stable)
        if (!stable) { owner.houseAnimals = { '1-0': 'boar' }; owner.resources.boar = 1 }
      }, played)
      const response = transition(session, 6, true)
      assert.deepEqual(count(response), [parents, stable ? 0 : 1, 0])
      save(`D167-N3-${parents}-${stable}-${played}`, response)
    }
  })
  it('D167 N4 actual harvest breeding creates one sheep and Pure Breeder cannot create a second after the harvest', () => {
    const session = make('D167_PureBreeder', state => pasture(state.players[0]!, 'sheep', 2, true), true, 4)
    const response = transition(session, 5, true)
    assert.deepEqual(count(response), [3, 0, 0])
    assert.equal(response.state.players[0]!.resources.begging, 0)
    save('D167-N4', response)
  })
  it('D167 N5 eligible nonharvest breeding can be declined without adding sheep or changing existing housing', () => {
    const session = make('D167_PureBreeder', state => pasture(state.players[0]!, 'sheep', 2, true))
    const response = transition(session, 6)
    assert.deepEqual(count(response), [2, 0, 0])
    assert.equal(response.state.players[0]!.pastures[0]!.animalCount, 2)
    save('D167-N5', response)
  })
})
