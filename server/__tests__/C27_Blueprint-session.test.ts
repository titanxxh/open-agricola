import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { PaymentSolver } from '../../shared/actions/payment'
import {
  computePaymentOptionsForTest,
  resolveCardCostDetailedForTest,
  resolveCardCostForTest,
} from '../../shared/actions/payment/__tests__/test-helpers'
import {
  collectComputeChoiceCandidates,
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import '../../shared/cards/C/C027_Blueprint'
import '../../shared/cards/B/B131_Equipper'
import assert from 'node:assert/strict'
import type { Resource } from '../../shared/contract/types'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

const CARD_ID = 'C027_Blueprint'
const ROUTING_LISTENER_ID = 'C27-blueprint-compute-choice-candidates'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

/**
 * C27 Blueprint — verify-only.
 *
 * The reference `Cards/C/the reference::onPlayerComputeCardCosts` clones every
 * matching stone cost trade for `Major_Joinery`, `Major_Pottery`,
 * `Major_Basket` only. OA mirrors that with card-purchase cost candidates.
 */
describe('C027_Blueprint session — verify chooseOne aligned to the reference majors', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    return { session, state, player: session.getState().state.players[0]! }
  }

  const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] as const

  it.each(ALLOWED_MAJORS)('adds sourced stone discount candidate for %s', (majorId) => {
    const { session: ruleSession, state, player } = setup()
    const baseCost = { wood: 2, stone: 2 }
    const resolved = ruleSession.withCtx(() => resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      majorId,
      baseCost, undefined, ruleSession.actionHooks,
    ))
    expect(PaymentSolver.isComplexCost(resolved.cost)).toBe(true)
    if (!PaymentSolver.isComplexCost(resolved.cost)) return
    expect(resolved.cost.fees).toEqual([
      baseCost,
      { wood: 2, stone: 1 },
    ])
    expect(resolved.cost.bonuses).toBeUndefined()
    expect(resolved.candidateMetadataByFeeIndex?.[1]?.sources).toEqual([CARD_ID])
  })

  it('surfaces only the discounted payment path for allowed majors', () => {
    const { session: ruleSession, state, player } = setup()
    player.resources = {
      ...player.resources,
      wood: 5,
      stone: 5,
    }
    const resolved = ruleSession.withCtx(() => resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      'Major_Joinery',
      { wood: 2, stone: 2 }, undefined, ruleSession.actionHooks,
    ))
    expect(PaymentSolver.isComplexCost(resolved.cost)).toBe(true)
    if (!PaymentSolver.isComplexCost(resolved.cost)) return

    const options = computePaymentOptionsForTest(player, resolved.cost)
    // ADR 0004 amendment: the printed {wood:2, stone:2} row is strictly
    // dominated by the discounted row and pruned from the payment options.
    expect(options.some((option) =>
      option.resourcesPaid.wood === 2 &&
      option.resourcesPaid.stone === 2,
    )).toBe(false)
    expect(options.some((option) =>
      option.resourcesPaid.wood === 2 &&
      option.resourcesPaid.stone === 1 &&
      option.feeIndex === 1 &&
      resolved.candidateMetadataByFeeIndex?.[option.feeIndex]?.sources.includes(CARD_ID),
    )).toBe(true)
  })

  it('does NOT reduce cost for non-listed majors (e.g. Major_Fireplace)', () => {
    const { session: ruleSession, state, player } = setup()
    const baseCost = { clay: 2 }
    const resolved = ruleSession.withCtx(() => resolveCardCostForTest(
      state,
      player,
      'improvement',
      'Major_Fireplace',
      baseCost, undefined, ruleSession.actionHooks,
    ))
    expect(PaymentSolver.isComplexCost(resolved)).toBe(false)
    if (PaymentSolver.isComplexCost(resolved)) return
    expect(resolved.clay).toBe(2)
  })

  it('does NOT reduce cost when player does not own C27', () => {
    const { session: ruleSession, state } = setup()
    const other = state.players[1]!
    const baseCost = { wood: 2, stone: 2 }
    const resolved = ruleSession.withCtx(() => resolveCardCostForTest(
      state,
      other,
      'improvement',
      'Major_Joinery',
      baseCost, undefined, ruleSession.actionHooks,
    ))
    expect(PaymentSolver.isComplexCost(resolved)).toBe(false)
    if (PaymentSolver.isComplexCost(resolved)) return
    expect(resolved.stone).toBe(2)
  })
})

/**
 * The reference `C027_Blueprint`'s second behavior — "you can build the major
 * improvements ... even when taking a Minor Improvement action" — is
 * implemented via a `computeChoiceCandidates` listener that injects the 3
 * allowed majors into the minor-improvement choice list (mirrors D131
 * CraftsmanshipPromoter pattern). The cost discount is handled by the
 * card-purchase candidate pipeline above.
 */
describe('C027_Blueprint session — minor-improvement routing for 3 majors', () => {
  const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] as const

  const setupWithResources = (overrides?: { playC27?: boolean }) => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    if (overrides?.playC27 !== false) {
      player.minorPlayed.push(CARD_ID)
    }
    // Plenty of resources so each allowed major is affordable
    player.resources = {
      ...player.resources,
      food: 10,
      wood: 5,
      clay: 5,
      stone: 5,
      reed: 5,
    }
    session.loadState(state)
    return { session, state, player: session.getState().state.players[0]! }
  }

  it('listener injects 3 allowed majors when player owns C27', () => {
    const { session: ruleSession, state, player } = setupWithResources()
    const listener = findListener(ruleSession, ROUTING_LISTENER_ID)
    expect(listener).toBeDefined()

    const result = ruleSession.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      params: { types: ['minor'] },
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

    expect(result?.extraOptions).toBeDefined()
    const values = (result!.extraOptions ?? []).map((o) => o.value).sort()
    for (const major of ALLOWED_MAJORS) {
      expect(values).toContain(major)
    }
    for (const opt of result!.extraOptions ?? []) {
      expect(opt.sourceCard).toBe(CARD_ID)
    }
  })

  it('listener returns nothing when player does not own C27', () => {
    const { session: ruleSession, state, player } = setupWithResources({ playC27: false })
    const listener = findListener(ruleSession, ROUTING_LISTENER_ID)!

    const result = ruleSession.withCtx(() => executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      params: { types: ['minor'] },
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('listener filters out majors that are not on the supply', () => {
    const { session: ruleSession, state, player } = setupWithResources()
    state.availableMajorImprovements = ['Major_Fireplace1', 'Major_Well']
    const listener = findListener(ruleSession, ROUTING_LISTENER_ID)!

    const result = ruleSession.withCtx(() => executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      params: { types: ['minor'] },
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('does not inject majors into B131 card-derived minor improvement choices', () => {
    const { session: ruleSession, state, player } = setupWithResources()

    const extras = ruleSession.withCtx(() => collectComputeChoiceCandidates(
      state,
      player,
      'improvement',
      { types: ['minor'], trueAction: false },
      'B131_Equipper', ruleSession.actionHooks,
    ))

    expect(extras.some((option) => option.value === 'Major_Joinery')).toBe(false)
  })
})

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, take, choose, opts, finish, minor, purchase, undo, resource, major, ownMajor } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("C027 N1 real purchase and all three literal minor-action workshops pay one less stone", () => { const b = make('C027_Blueprint', undefined, false), bought = purchase(b, 'C027_Blueprint'), u = undo(b); resource(bought, { food: 99 }); resource(u, { food: 100 }); for (const [id, good] of [['Major_Joinery', 'wood'], ['Major_Pottery', 'clay'], ['Major_Basket', 'reed']] satisfies Array<[
      string,
      keyof Resource
  ]>) {
      const s = make('C027_Blueprint', st => { st.players[0]!.resources[good] = 2; st.players[0]!.resources.stone = 1; }), p = minor(s), o = opts(p).find(o => o.value === id);
      assert.ok(o);
      const r = finish(s, choose(s, 0, o.value));
      resource(r, { [good]: 0, stone: 0 });
      assert.ok(r.state.players[0]!.improvements.includes(id));
      save(`C027-N1-${good}`, { bought, u, p, r });
  } });
  it("C027 N2 hand missing stone nonlisted or unavailable major rejects without a discounted purchase", () => { for (const mode of ['hand', 'stone', 'owned', 'nonlisted']) {
      const s = make('C027_Blueprint', st => { Object.assign(st.players[0]!.resources, { wood: 2, stone: mode === 'stone' ? 0 : 1, clay: 2 }); if (mode === 'owned')
          ownMajor(st, 'Major_Joinery', 1); }, mode !== 'hand'), p = minor(s), id = mode === 'nonlisted' ? 'Major_Fireplace1' : 'Major_Joinery';
      assert.equal(opts(p).some(o => o.value === id && !('disabled' in o && o.disabled)), false);
      const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, id)), r = finish(s, choose(s, 0, 'B004_WoodPile'));
      assert.ok(!r.state.players[0]!.improvements.includes(id));
      save(`C027-N2-${mode}`, { p, bad, r });
  } const s = make('C027_Blueprint', st => Object.assign(st.players[0]!.resources, { clay: 2, stone: 2 })), r = finish(s, major(s, 'Major_Fireplace1')); resource(r, { clay: 0, stone: 2 }); save('C027-N2-normalMajor', r); });
  it("C027 N3 a real Equipper card-derived minor ability excludes affordable Blueprint majors", () => { const s = make('C027_Blueprint', st => { st.players[0]!.occupationPlayed = ['B131_Equipper']; st.players[0]!.minorHand = ['C013_WoodSlideHammer', 'B004_WoodPile', 'A006_StorageBarn']; st.players[0]!.resources.stone = 1; st.actionSpaces.find(x => x.id === 'forest')!.resources.wood = 3; }, true, 5, 3); let p = take(s, 0, 'forest'); for (let n = 0; n < 8 && !opts(p).some(o => o.value === 'C013_WoodSlideHammer'); n++) {
      assert.ok(p.interaction.stateId === 'wait');
      const o = opts(p).find(o => o.value !== '__skip__' && o.value !== '__pass__');
      assert.ok(o);
      p = choose(s, 0, o.value);
  } assert.equal(opts(p).some(o => o.value === 'Major_Joinery'), false); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_Joinery')), r = finish(s, choose(s, 0, 'C013_WoodSlideHammer'), false); resource(r, { wood: 2, stone: 1 }); assert.ok(r.state.players[0]!.minorPlayed.includes('C013_WoodSlideHammer')); save('C027-N3', { p, bad, r }); });
})
