import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import type { SessionResponse } from '../game/authoritative-session'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

describe('ae-negative-51-family', () => {
  const { sessions, ok, options, save, setup, choose, finish, next, build, offer, take, move } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D128 N1 another player building one or two rooms allows only one paid owner room for one transferred food', () => {
    for (const count of [1, 2]) {
      const s = setup('D128_BuildingTycoon', 14, state => { Object.assign(state.players[0]!.resources, { wood: 10, reed: 4 }); Object.assign(state.players[1]!.resources, { wood: 10, reed: 4 }); })
      move(s, 'day-laborer')
      next(s)
      let r = build(s, take(s, 'farm-expansion'), count)
      r = offer(s, r, 'D128_BuildingTycoon')
      if (!(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select'))
        r = choose(s, r, o => !['__skip__', '__pass__'].includes(o.value))
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'room')
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'room' ? r.interaction.request.farm.selectableTiles.slice(0, 2) : [] }))
      r = build(s, r)
      assert.equal(r.state.players[0]!.rooms, 3)
      assert.equal(r.state.players[1]!.rooms, 2 + count)
      assert.equal(r.state.players[0]!.resources.wood, 5)
      assert.equal(r.state.players[0]!.resources.reed, 2)
      assert.equal(r.state.players[0]!.resources.food, 21)
      assert.equal(r.state.players[1]!.resources.food, 21)
      save(`D128-N1-${count}`, r)
    }
  })
  it('D128 N2 decline zero food unavailable room cost own construction and opponent stable do not buy another room', () => {
    for (const mode of ['decline', 'food', 'cost', 'own', 'stable']) {
      const s = setup('D128_BuildingTycoon', 14, state => { Object.assign(state.players[0]!.resources, { wood: mode === 'cost' ? 4 : mode === 'own' ? 10 : 5, reed: mode === 'own' ? 4 : 2, food: mode === 'food' ? 0 : 20 }); Object.assign(state.players[1]!.resources, { wood: mode === 'stable' ? 2 : 5, reed: 2 }); })
      let r: SessionResponse
      if (mode === 'own') {
        r = build(s, take(s, 'farm-expansion'))
        assert.ok(!(r.interaction.stateId === 'wait' && (r.interaction.sourceCard === 'D128_BuildingTycoon' || options(r).some(o => o.value === 'D128_BuildingTycoon'))))
      }
      else {
        move(s, 'grain-seeds')
        next(s)
        r = take(s, 'farm-expansion')
        if (mode === 'stable') {
          if (!(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select'))
            r = choose(s, r, o => o.labelKey === 'actions.stables.name')
          assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable')
          r = ok(s.commitSelectionChoice(1, { stables: [r.interaction.request.farm.selectableTiles[0]!] }))
        }
        else
          r = build(s, r)
      }
      r = finish(s, r)
      assert.equal(r.state.players[0]!.rooms, mode === 'own' ? 3 : 2)
      assert.equal(r.state.players[0]!.resources.food, mode === 'food' ? 0 : 20)
      assert.equal(r.state.players[1]!.resources.food, 20)
      save(`D128-N2-${mode}`, r)
    }
  })
})
