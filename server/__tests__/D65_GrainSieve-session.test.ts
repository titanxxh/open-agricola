import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/D/D065_GrainSieve'
import type { ActionFlow } from '../../shared/contract/types'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import assert from 'node:assert/strict'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

const CARD_ID = 'D065_GrainSieve'

describe('D065_GrainSieve session', () => {
  const setupForHarvest = (options: {
    grainFields?: { row: number; col: number; crop: 'grain'; remaining: number }[]
    vegetableFields?: { row: number; col: number; crop: 'vegetable'; remaining: number }[]
  }) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    player.fields = [
      ...(options.grainFields ?? []),
      ...(options.vegetableFields ?? []),
    ]

    // Set workers to 0 for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough to feed
    })

    session.loadState(state)
    return session
  }

  it('onAfterReap grants 1 grain when 2+ grain harvested', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 3 }, grainFields: 3, vegetableFields: 0 },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(1)
    expect(children[0].actionId).toBe('gain')
    expect(children[0].params).toEqual({ grain: 1 })
  })

  it('onAfterReap does not trigger when only 1 grain harvested', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeNull()
  })

  it('onAfterReap does not trigger when no grain harvested', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 2 }, grainFields: 0, vegetableFields: 2 },
    }

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeNull()
  })


  it('integration: harvest with 2 grain fields gains 1 bonus grain', () => {
    const session = setupForHarvest({
      grainFields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
      ],
    })

    const grainBefore = session.getState().state.players[0]!.resources.grain

    autoAdvanceRoundEnd(session, {
      onChoice: (intx, sess) =>
        sess.resolveChoice(intx.playerIndex, 'ok'),
    })

    const player = session.getState().state.players[0]!
    // 2 grain fields harvested (1 each = 2 grain) + 1 bonus grain from sieve = grainBefore + 3
    expect(player.resources.grain).toBe(grainBefore + 2 + 1)
  })

  it('integration: harvest with 1 grain field does not trigger bonus', () => {
    const session = setupForHarvest({
      grainFields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      ],
    })

    const grainBefore = session.getState().state.players[0]!.resources.grain

    autoAdvanceRoundEnd(session)

    const player = session.getState().state.players[0]!
    // Only 1 grain field (remaining: 2 yields 1 grain) => +1 grain from harvest, no bonus
    expect(player.resources.grain).toBe(grainBefore + 1)
  })
})

describe('ae-negative-40-crops', () => {
  const { sessions, save, setup, finish, completeRound, hand, buy, printed, fields, denyMinor } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D065 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'D065_GrainSieve'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.wood, 0); save("D065-N1-legal", r); const t = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 0 }); }); denyMinor(t, card); save("D065-N1-short", t.getState()); });
  it('D065 N2 natural field phases reward two and three harvested grain exactly once', () => { for (const n of [2, 3]) {
      const card = 'D065_GrainSieve', s = setup(card, 7, st => fields(st, n, Array.from({ length: n }, () => ({ kind: 'grain', remaining: 2 }))));
      const r = finish(s, completeRound(s, ['clay-pit', 'forest', 'reed-bank', 'fishing']));
      assert.equal(r.state.round, 8);
      assert.equal(r.state.players[0]!.resources.grain, n + 1);
      assert.equal(r.state.players[0]!.resources.food, 36);
      assert.equal(r.state.players[0]!.fields.every(f => f.stacks?.[0]?.remaining === 1), true);
      save(`D065-N2-${n}`, r);
  } });
  it('D065 N3 old grain vegetables hand and nonharvest exclude the extra grain', () => { for (const mode of ['old', 'vegetable', 'hand', 'nonharvest']) {
      const card = 'D065_GrainSieve', s = setup(card, mode === 'nonharvest' ? 6 : 7, st => { if (mode === 'vegetable')
          fields(st, 2, [{ kind: 'vegetable', remaining: 2 }, { kind: 'vegetable', remaining: 2 }]);
      else
          fields(st, mode === 'hand' ? 2 : 1, Array.from({ length: 2 }, () => ({ kind: 'grain', remaining: 2 }))); if (mode === 'old')
          st.players[0]!.resources.grain = 20; if (mode === 'hand')
          hand(st, card); });
      const r = finish(s, completeRound(s, ['clay-pit', 'forest', 'reed-bank', 'fishing']));
      assert.equal(r.state.players[0]!.resources.grain, mode === 'old' ? 21 : mode === 'hand' ? 2 : 0);
      save(`D065-N3-${mode}`, r);
  } });
})
