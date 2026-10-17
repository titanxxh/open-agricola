import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/A/A059_PotatoRidger'
import type { ActionFlow } from '../../shared/contract/types'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Fields from './_helpers/audit/ae-negative-08-fields'

const CARD_ID = 'A059_PotatoRidger'

describe('A059_PotatoRidger session', () => {
  const setup = (options: {
    vegetableFields?: { row: number; col: number; crop: 'vegetable'; remaining: number }[]
    extraVegetable?: number
  }) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Set up vegetable fields
    if (options.vegetableFields) {
      player.fields = options.vegetableFields
    }

    // Set extra vegetable in supply (on top of what will be harvested)
    player.resources.vegetable = options.extraVegetable ?? 0

    // Set workers to 0 for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough to feed
    })

    session.loadState(state)
    return session
  }

  it('with 3 veg after harvest → optional exchange available (direct hook test)', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 3

    // Simulate harvestReapSummary showing 1 vegetable field was harvested
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true) // 3 veg = optional
  })

  it('with 4 veg after harvest → mandatory exchange', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 4

    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(false) // 4 veg = mandatory
  })

  it('with 2 veg after harvest → no trigger', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 2

    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeNull()
  })

  it('no vegetable harvested → no trigger even with 5 veg in supply', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 5

    state.harvestReapSummary = {
      [player.id]: { resources: {}, grainFields: 0, vegetableFields: 0 },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeNull()
  })


  it('integration: mandatory exchange triggers during harvest with 4+ veg', () => {
    // 3 veg fields with remaining=1 each → after harvest: 3 veg harvested
    // Plus 1 extra in supply → total 4 veg after harvest → mandatory
    const session = setup({
      vegetableFields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
      extraVegetable: 1, // 1 already in supply + 3 harvested = 4 total
    })

    const vegBefore = session.getState().state.players[0]!.resources.vegetable
    const foodBefore = session.getState().state.players[0]!.resources.food

    autoAdvanceRoundEnd(session, {
      onChoice: (intx, sess) =>
        sess.resolveChoice(intx.playerIndex, 'ok'),
    })

    const player = session.getState().state.players[0]!
    // Started with 1 veg + harvested 3 = 4 veg, then -1 from exchange = 3 veg
    // But food cost was paid: -2 for feeding 1 family, +6 from exchange
    expect(player.resources.vegetable).toBe(3) // 4 - 1 = 3
    expect(player.resources.food).toBe(foodBefore + 6 - 2) // +6 from exchange, -2 for feeding
  })

  it('integration: no trigger with 2 veg after harvest', () => {
    const session = setup({
      vegetableFields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
      extraVegetable: 1, // 1 already + 1 harvested = 2 total → no trigger
    })

    autoAdvanceRoundEnd(session)

    const player = session.getState().state.players[0]!
    expect(player.resources.vegetable).toBe(2) // 1 + 1 harvested, no exchange
  })
})

describe('ae-negative-08-fields', () => {
  const { RIDGER, save, sessions, setup, buy, deny, cardFlow, fields, end, remaining, potato, potatoResult } = audit08Fields
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A059 N1 actual printed one wood purchase cannot exchange existing vegetable stock', () => { deny(setup(RIDGER), RIDGER); const r = buy(setup(RIDGER, { resources: { wood: 1, vegetable: 4 } }), RIDGER); assert.equal(r.state.players[0]!.resources.wood, 0); assert.deepEqual(potatoResult(r), [4, 40]) })
  it('A059 N2 real ordinary harvest to two gives none and to three may exchange one', () => { const low = potato(1); assert.deepEqual(potatoResult(end(low)), [2, 36]); const s = potato(2); const r = cardFlow(s, end(s), RIDGER); assert.deepEqual(potatoResult(r), [2, 42]); assert.deepEqual(remaining(r), [1]) })
  it('A059 N3 real ordinary harvest to four and five automatically exchanges one', () => { for (const before of [3, 4]) { const s = potato(before); const r = cardFlow(s, end(s), RIDGER); assert.deepEqual(potatoResult(r), [before, 42]); assert.equal(r.state.round, 5) } })
  it('A059 N4 own grain only harvest and real opponent vegetable harvest do not trigger owner', () => {
   const grain = potato(4, [], state => fields(state, 'grain', [2])); let r = end(grain); assert.deepEqual(potatoResult(r), [4, 36]); assert.deepEqual(remaining(r), [1])
   const s = potato(4, [], state => fields(state, 'vegetable', [2], 1)); r = end(s); assert.deepEqual(potatoResult(r), [4, 36]); assert.equal(r.state.players[1]!.resources.vegetable, 1)
  })
  it('A059 N5 optional decline at three preserves vegetables and stale exchange is rejected', () => { const s = potato(2); const r = cardFlow(s, end(s), RIDGER, false); assert.deepEqual(potatoResult(r), [3, 36]); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'invalid-exchange-two-vegetables')) })
  it('A059 N6 three actual vegetable fields harvest once and exchange one from stock eight', () => { const s = potato(5, [2, 2, 2]); const r = cardFlow(s, end(s), RIDGER); assert.deepEqual(potatoResult(r), [7, 42]); assert.deepEqual(remaining(r), [1, 1, 1]) })
  it('A059 N8 actual harvest undo capability is recorded with native snapshot and retry', () => { const s = potato(2); const pending = end(s); const snapshot = undoRuleSnapshot(pending); const undone = s.undoStep(); save('A059-N8-undo', { pending, undone }); if (!undone.ok) { assert.deepEqual(JSON.parse(undoRuleSnapshot(undone)), JSON.parse(snapshot)); cardFlow(s, s.getState(), RIDGER); assert.deepEqual(potatoResult(s.getState()), [2, 42]) } else { assert.equal(undone.state.players[0]!.resources.vegetable, 3); const r = cardFlow(s, undone, RIDGER); assert.deepEqual(potatoResult(r), [2, 42]) } })
})
