import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E127_DiligentFarmer'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

const CARD_ID = 'E127_DiligentFarmer'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

describe('E127_DiligentFarmer session', () => {
  it('onBuy offers free room when player has 3+ scoring categories at 4 points', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Set up to score 4 in fields (5+ fields), pastures (4+ pastures), grains (8+ grain)
    player.fields = [
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 1, col: 2, stacks: [] },
      { row: 1, col: 3, stacks: [] },
      { row: 1, col: 4, stacks: [] },
    ]
    // 5 fields = 4 points

    player.resources.grain = 6
    // 6 grain + 2 on fields = 8 grain = 4 points

    player.pastures = [
      { id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: null, animalCount: 0 },
      { id: 'p2', size: 1, tiles: [{ row: 2, col: 1 }], stables: 0, animalType: null, animalCount: 0 },
      { id: 'p3', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
      { id: 'p4', size: 1, tiles: [{ row: 2, col: 3 }], stables: 0, animalType: null, animalCount: 0 },
    ]
    // 4 pastures = 4 points

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBuy!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.optional).toBe(true)
    expect(seq.children[0]!.type).toBe('leaf')
    expect(seq.children[0]!.actionId).toBe('construct')
    expect(seq.children[0]!.actionContext).toMatchObject({
      maxRooms: 1,
      exactCost: { max: 1 },
      trueAction: false,
    })
  })

  it('onBuy returns undefined when player has fewer than 3 categories at max score', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Only 1 category at max: fields = 5 → 4 points
    player.fields = [
      { row: 1, col: 0, stacks: [] },
      { row: 1, col: 1, stacks: [] },
      { row: 1, col: 2, stacks: [] },
      { row: 1, col: 3, stacks: [] },
      { row: 1, col: 4, stacks: [] },
    ]
    // 5 fields = 4 points, but only 1 category

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBuy!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onBuy returns undefined with no max score categories at all', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBuy!(state, player))
    expect(flow).toBeUndefined()
  })
})

describe('ae-negative-51-family', () => {
  const { sessions, save, setup, choose, finish, play, build, offer } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E127 N1 three maximum scoring categories permit exactly one free room and decline preserves farm', () => {
    for (const mode of ['accept', 'decline', 'two']) {
      const s = setup('E127_DiligentFarmer', 14, state => { Object.assign(state.players[0]!.resources, { grain: 8, vegetable: mode === 'two' ? 0 : 4 }); state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }, { row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }, { row: 1, col: 1, stacks: [] }, { row: 1, col: 2, stacks: [] }]; })
      let r = play(s, 'E127_DiligentFarmer')
      if (mode === 'accept') {
        r = offer(s, r, 'E127_DiligentFarmer')
        r = choose(s, r, o => !['__skip__', '__pass__'].includes(o.value))
        assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'room')
        assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 3 }, { row: 2, col: 1 }] }))
        r = build(s, r)
      }
      else
        r = finish(s, r)
      assert.equal(r.state.players[0]!.rooms, mode === 'accept' ? 3 : 2)
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.resources.reed, 0)
      assert.ok(r.scores)
      for (const key of ['fields', 'grains'])
        assert.equal(r.scores[0]!.categories.find(c => c.key === key)?.total, 4)
      save(`E127-N1-${mode}`, r)
    }
  })
  it('E127 N2 fenced four stables count as third maximum scoring category for actual free room', () => { const s = setup('E127_DiligentFarmer', 14, state => { const p = state.players[0]!; p.resources.grain = 8; p.fields = [{ row: 0, col: 0, stacks: [] }, { row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }, { row: 1, col: 1, stacks: [] }, { row: 1, col: 2, stacks: [] }]; const tiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 3 }, { row: 1, col: 4 }]; p.stableTiles = tiles; p.pastures = [{ id: 'fenced-stables', tiles, animalType: null, animalCount: 0 }]; p.fenceSegments = ['H-0-3', 'H-0-4', 'H-2-3', 'H-2-4', 'V-0-3', 'V-1-3', 'V-0-5', 'V-1-5'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })); }); let r = play(s, 'E127_DiligentFarmer'); assert.ok(r.scores); assert.equal(r.scores[0]!.categories.find(c => c.key === 'stables')?.total, 4); r = build(s, offer(s, r, 'E127_DiligentFarmer')); assert.equal(r.state.players[0]!.rooms, 3); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.reed, 0); save('E127-N2', r); })
})
