import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

import { C056_FeedFence } from '../../shared/cards/C/C056_FeedFence'
import '../../shared/cards/C/C088_CarpentersApprentice'
import '../../shared/cards/C/C094_StableCleaner'
import { D088_Millwright } from '../../shared/cards/D/D088_Millwright'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Fields from './_helpers/audit/ae-negative-38-fields'

const CARD_ID = 'C056_FeedFence'

describe('C056_FeedFence session', () => {
  const setupPaymentSession = (playerCount: 2 | 6 = 2) => {
    const session = new GameSession(56, undefined, { playerCount })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    Object.assign(player.resources, {
      wood: 0,
      clay: 0,
      reed: 0,
      food: 0,
      grain: 0,
    })
    session.loadState(state)
    return { session, state, player }
  }

  const runAfterStables = (configure: (player: import('../../shared/contract/types').PlayerState) => void) => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = []
    configure(player)
    const space = state.actionSpaces.find((s) => s.id === 'farm-expansion')!
    session.loadState(state)

    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (reg) => reg.id === 'C56-feed-fence-after-stables',
    )!
    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'stables',
      phase: 'after',
      result: { type: 'ok' },
    }
    return session.withCtx(() => executeCardListener(listener, context))
  }

  it('grants the 4th-stable bonus when the 4th stable is the B85 FarmHand stable (card-facing count)', () => {
    // B85 already in use before this action; the snapshot baseline is the
    // card-facing count (2 ordinary + B85 = 3). Now 3 ordinary tiles
    // (1 built this action) + B85 -> card-facing count = 4 -> +2 food bonus
    // on top of 1 built = 3 food.
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }]
      player.occupationPlayed.push('B085_FarmHand')
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 3 } },
        B085_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
      }
    })
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(3)
  })

  it('no bonus when card-facing count is 3 (only 1 built food)', () => {
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }]
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 2 } },
      }
    })
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('pays 1 clay for the Side Job stable whose pure wood cost is 1', () => {
    const { session, state, player } = setupPaymentSession(6)
    player.resources.clay = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'side-job-6')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected stable selection')
    }
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stables')
    const stable = resp.interaction.request.farm.selectableTiles[0]!

    resp = session.commitSelectionChoice(0, { stables: [stable] })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toEqual([stable])
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 1 })
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'stables',
        resources: { clay: 1 },
        bonusSources: [CARD_ID],
      }),
    ]))
    expect(readCardResourceStats(resp.state.players[0]!, CARD_ID)?.saved).toEqual({ wood: 1 })
    expect(readCardResourceStats(resp.state.players[0]!, CARD_ID)?.paid).toEqual({ clay: 1 })
    expect(resp.state.log.some((entry) => entry.key === 'log.actionDetail')).toBe(true)
    expect(resp.scores).toHaveLength(6)
  })

  it('replaces only one standard stable when building two', () => {
    const { session, state, player } = setupPaymentSession()
    Object.assign(player.resources, { wood: 2, clay: 1 })
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected stable selection')
    }
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stables')
    const stables = resp.interaction.request.farm.selectableTiles.slice(0, 2)
    expect(stables).toHaveLength(2)

    resp = session.commitSelectionChoice(0, { stables })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toEqual(stables)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 2 })
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'stables',
        resources: { wood: 2, clay: 1 },
        bonusSources: [CARD_ID],
      }),
    ]))
    expect(resp.state.log.some((entry) => entry.key === 'log.actionDetail')).toBe(true)
    expect(resp.scores).toHaveLength(2)
  })

  it('replaces only one stable after Carpenter Apprentice discounts the 3rd and 4th', () => {
    const blocked = setupPaymentSession()
    blocked.player.occupationPlayed.push('C088_CarpentersApprentice')
    blocked.player.stableTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]
    blocked.player.resources.clay = 1
    blocked.session.loadState(blocked.state)

    const blockedResp = blocked.session.takeAction(0, 'farm-expansion')
    expect(blockedResp.interaction.stateId).toBe('wait')
    if (blockedResp.interaction.stateId !== 'wait' || blockedResp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected stable selection')
    }
    expect(blockedResp.interaction.request.farm.farmType).toBe('stable')
    if (blockedResp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stables')
    expect(blockedResp.interaction.request.farm.maxSelections).toBe(1)
    const blockedStables = blockedResp.interaction.request.farm.selectableTiles.slice(0, 2)
    expect(blockedStables).toHaveLength(2)
    const blockedCommit = blocked.session.commitSelectionChoice(0, { stables: blockedStables })
    expect(blockedCommit.ok).toBe(false)

    const { session, state, player } = setupPaymentSession()
    player.occupationPlayed.push('C088_CarpentersApprentice')
    player.stableTiles = [{ row: 2, col: 0 }, { row: 2, col: 1 }]
    Object.assign(player.resources, { wood: 1, clay: 1 })
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected stable selection')
    }
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stables')
    const stables = resp.interaction.request.farm.selectableTiles.slice(0, 2)

    resp = session.commitSelectionChoice(0, { stables })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'stables',
        resources: { wood: 1, clay: 1 },
      }),
    ]))
    expect(resp.state.log.some((entry) => entry.key === 'log.actionDetail')).toBe(true)
    expect(resp.scores).toHaveLength(2)
  })

  it('composes with Millwright independently of active modifier order', () => {
    const feedFenceModifier = C056_FeedFence.impl.modifiers![0]!
    const millwrightModifiers = D088_Millwright.impl.modifiers!
      .filter((modifier) => modifier.appliesTo.includes('stables'))

    for (const activeModifiers of [
      [feedFenceModifier, ...millwrightModifiers],
      [...millwrightModifiers, feedFenceModifier],
    ]) {
      const { session, state, player } = setupPaymentSession()
      player.occupationPlayed.push('D088_Millwright')
      player.activeModifiers = activeModifiers
      player.resources.grain = 1
      session.loadState(state)

      let resp = session.takeAction(0, 'farm-expansion')
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
        throw new Error('expected stable selection')
      }
      expect(resp.interaction.request.farm.farmType).toBe('stable')
      if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stables')
      const stable = resp.interaction.request.farm.selectableTiles[0]!

      resp = session.commitSelectionChoice(0, { stables: [stable] })

      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, grain: 0 })
      expect(resp.state.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: 'resource.paid',
          paymentFor: 'stables',
          resources: { grain: 1 },
          bonusSources: expect.arrayContaining([CARD_ID, 'D088_Millwright']),
        }),
      ]))
      expect(resp.state.log.some((entry) => entry.key === 'log.actionDetail')).toBe(true)
      expect(resp.scores).toHaveLength(2)
    }
  })

  it('does not apply to Stable Cleaner mixed wood and food cost', () => {
    const blocked = setupPaymentSession()
    blocked.player.occupationPlayed.push('C094_StableCleaner')
    Object.assign(blocked.player.resources, { clay: 1, food: 1 })
    blocked.session.loadState(blocked.state)

    const unavailable = blocked.session.takeAction(0, 'farmland')
    expect(unavailable.ok).toBe(true)
    expect(unavailable.interaction.anytimeActions.map((action) => action.id))
      .not.toContain('C94-stable-cleaner-anytime')

    const payable = setupPaymentSession()
    payable.player.occupationPlayed.push('C094_StableCleaner')
    Object.assign(payable.player.resources, { wood: 1, clay: 1, food: 1 })
    payable.session.loadState(payable.state)

    let resp = payable.session.takeAction(0, 'farmland')
    expect(resp.interaction.anytimeActions.map((action) => action.id))
      .toContain('C94-stable-cleaner-anytime')
    resp = payable.session.takeAnytimeAction(0, 'C94-stable-cleaner-anytime')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected stable selection')
    }
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') throw new Error('expected stables')
    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = payable.session.commitSelectionChoice(0, { stables: [stable] })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1, food: 1 })
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'stables',
        resources: { wood: 1, food: 1 },
      }),
    ]))
    const paid = resp.state.events.find(
      (event) => event.type === 'resource.paid' && event.paymentFor === 'stables',
    )
    expect(paid?.type === 'resource.paid' ? paid.bonusSources ?? [] : []).not.toContain(CARD_ID)
    expect(resp.state.log.some((entry) => entry.key === 'log.actionDetail')).toBe(true)
    expect(resp.scores).toHaveLength(2)
  })
})

describe('ae-negative-38-fields', () => {
  const { sessions, save, ok, make, choose, finish, ready, action, buy, fence, stablePending } = audit38Fields
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C056 N1 actual wood purchase and one clay substituted stable or two mixed payment stables grant exactly one food per stable', () => {
      const b = fence(false, 1), bought = finish(b, buy(b, 'C056_FeedFence'));
      assert.equal(bought.state.players[0]!.resources.wood, 0);
      const rows = [];
      for (const count of [1, 2] as const) {
          const s = fence(true, (count - 1) * 2), p = stablePending(s), r = finish(s, ok(s.commitSelectionChoice(0, { stables: Array.from({ length: count }, (_, i) => ({ row: 0, col: i + 1 })) })));
          assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.food, r.state.players[0]!.stableTiles.length], [0, 0, 100 + count, count]);
          rows.push({ p, r });
      }
      save('C056-N1', { bought, rows });
  });
  it('C056 N2 the actual fourth farmyard stable grants three food while an occupied room and a second clay substitution reject before legal retry', () => { const s = fence(true, 0, 1, 3), p = stablePending(s), wrong = assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { stables: [{ row: 0, col: 4 }] })), occupied = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 1, col: 0 }] })), r = finish(s, ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 4 }] }))); assert.deepEqual([r.state.players[0]!.stableTiles.length, r.state.players[0]!.resources.food], [4, 103]); const t = fence(true, 0, 2), p2 = stablePending(t), bad = assertRejectedUnchanged(t, () => t.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }, { row: 0, col: 2 }] })), control = finish(t, ok(t.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))); assert.deepEqual([control.state.players[0]!.stableTiles.length, control.state.players[0]!.resources.clay, control.state.players[0]!.resources.food], [1, 1, 101]); save('C056-N2', { p, wrong, occupied, r, p2, bad, control }); });
  it('C056 N3 held card stables pay normal wood and actual opponent stable building gives the owner no food', () => {
      const s = fence(false, 2, 0), p = stablePending(s), hand = finish(s, ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })));
      assert.deepEqual([hand.state.players[0]!.resources.wood, hand.state.players[0]!.resources.food], [0, 100]);
      const t = make('C056_FeedFence', true, s => { s.players[1]!.resources.wood = 2; }), first = action(t, 0, 'reed-bank');
      ready(t);
      let q = ok(t.takeAction(1, 'farm-expansion'));
      if (q.interaction.stateId === 'wait' && q.interaction.request.kind === 'choice')
          q = choose(t, q, o => o.labelKey === 'actions.stables.name');
      const opponent = finish(t, ok(t.commitSelectionChoice(1, { stables: [{ row: 0, col: 1 }] })));
      assert.equal(opponent.state.players[0]!.resources.food, 100);
      assert.equal(opponent.state.players[1]!.resources.food, 100);
      save('C056-N3', { p, hand, first, q, opponent });
  });
  it('C056 N4 missing printed purchase wood cannot buy Feed Fence and one normal wood stable remains legal without using the optional clay substitution', () => { const s = fence(false, 0), p = buy(s, 'C056_FeedFence'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'C056_FeedFence')); const t = fence(true, 2, 0), q = stablePending(t), r = finish(t, ok(t.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))); assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food, r.state.players[0]!.stableTiles.length], [0, 101, 1]); save('C056-N4', { p, bad, q, r }); });
})
