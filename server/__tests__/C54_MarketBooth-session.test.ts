import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getFenceCount } from '../../shared/actions/effects/fencing'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getRegisteredMinorImprovement } from '../../shared/cards/registry-display'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { setFencesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'

import '../../shared/cards/C/C054_MarketBooth'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

const CARD_ID = 'C054_MarketBooth'

const setupForHarvestField = (options?: {
  builtFences?: number
  consumedFences?: number
  e74HeldFences?: number
  grain?: number
}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4 // harvest round (field phase yields)

  // Make every farmer used so harvest immediately enters end-of-round flow.
  state.players.forEach((p) => {
    markAllWorkersUsed(state, p)
    p.resources.food = 100 // plenty for feeding; we measure deltas
  })

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.resources.grain = options?.grain ?? 1
  setFencesForTest(player, options?.builtFences ?? 4)
  if (options?.consumedFences !== undefined) {
    player.supplyTokensConsumed = { fence: options.consumedFences }
  }
  if (options?.e74HeldFences) {
    player.minorPlayed.push('E074_AshTrees')
    player.cardStates = {
      ...player.cardStates,
      E074_AshTrees: { counters: { fences: options.e74HeldFences } },
    }
  }

  // No fields with grain — keep harvest reap deterministic.
  player.fields = []

  session.loadState(state)
  return session
}

const drainPending = (session: GameSession, accept: boolean) => {
  let resp = session.performRoundEnd()
  let safety = 30
  while (safety-- > 0 && resp.interaction.stateId === 'wait') {
    if (resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
    } else {
      const opts = resp.interaction.request.options ?? []
      // Optional SEQ surfaces as 2-option choice: [actionNode, __skip__].
      // Accepting picks the non-skip option; declining picks __skip__.
      const skipOpt = opts.find((o: ActionChoiceOption) => o.value === '__skip__')
      const nonSkip = opts.find((o: ActionChoiceOption) => o.value !== '__skip__')
      const target = accept ? nonSkip ?? opts[0] : skipOpt ?? nonSkip ?? opts[0]
      if (!target) break
      resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, target.value)
    }
  }
  return resp
}

const setupForPurchase = (options?: { noStableReserve?: boolean }) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  if (options?.noStableReserve) {
    player.stableTiles = [{ row: 0, col: 1 }]
    player.supplyTokensConsumed = { stable: 1 }
    player.occupationPlayed.push('B085_FarmHand')
    player.cardStates = {
      ...player.cardStates,
      B085_FarmHand: { extraData: { position: { row: 1, col: 1 } } },
    }
    state.futureMeeples.push({
      id: 'future-stable',
      cardId: 'A089_StablePlanner',
      playerId: player.id,
      round: 6,
      actionId: null,
      resources: { stable: 1 },
    })
  }

  session.loadState(state)
  return session
}

const takeMeetingPlaceToMinorOptions = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  let safety = 10
  while (safety-- > 0 && resp.interaction.stateId === 'wait') {
    const options = resp.interaction.request.options ?? []
    if (options.some((option) => option.value === CARD_ID)) break
    const accept = options.find((option) => option.value !== '__skip__')
    if (!accept) break
    resp = session.resolveChoice(0, accept.value)
  }
  return resp
}

describe('C054_MarketBooth session', () => {
  it('has no prerequisite (reference C054_MarketBooth has no isBuyable / prerequisite)', () => {
    const card = getRegisteredMinorImprovement(CARD_ID)!
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    // Even with all 4 stables built, the reference does not gate the purchase.
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 },
    ]
    expect(session.withCtx(() => meetsCardPrerequisites(player, card as never, 1, state))).toBe(true)
  })

  it('pays one stable supply token through the minor-improvement purchase path', () => {
    const session = setupForPurchase()
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((entry) => entry.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    const player = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(player.minorPlayed).toContain(CARD_ID)
    expect(player.supplyTokensConsumed?.stable).toBe(1)
    expect(player.stableTiles).toHaveLength(0)
  })

  it('cannot be played when stable reserve is exhausted by built, future, FarmHand, and consumed stable tokens', () => {
    const session = setupForPurchase({ noStableReserve: true })
    const resp = takeMeetingPlaceToMinorOptions(session)
    const options = resp.interaction.stateId === 'wait' ? resp.interaction.request.options ?? [] : []
    expect(options.some((entry) => entry.value === CARD_ID)).toBe(false)
  })

  it('on harvest field phase end, accepting pays grain + reserve fence and grants 5 food', () => {
    const sessionAccept = setupForHarvestField()
    const beforeAccept = sessionAccept.getState().state.players[0]!
    const grainBefore = beforeAccept.resources.grain
    const fenceBefore = getFenceCount(beforeAccept)
    const foodBefore = beforeAccept.resources.food

    // Compare against an identical decline run to factor out feeding-phase food cost.
    const sessionDecline = setupForHarvestField()
    const respDecline = drainPending(sessionDecline, /* accept */ false)
    const afterDecline = respDecline.state.players[0]!

    const respAccept = drainPending(sessionAccept, /* accept */ true)
    const afterAccept = respAccept.state.players[0]!

    expect(afterAccept.resources.grain).toBe(grainBefore - 1)
    expect(getFenceCount(afterAccept)).toBe(fenceBefore)
    expect(afterAccept.supplyTokensConsumed?.fence).toBe(1)
    // accept flow nets +5 food relative to decline flow (other phases identical)
    expect(afterAccept.resources.food - afterDecline.resources.food).toBe(5)
    // Sanity: foodBefore unchanged on the original snapshot
    expect(foodBefore).toBe(100)
  })

  it('on harvest field phase end, declining keeps grain and fence unchanged', () => {
    const session = setupForHarvestField()
    const before = session.getState().state.players[0]!
    const grainBefore = before.resources.grain
    const fenceBefore = getFenceCount(before)

    const resp = drainPending(session, /* accept */ false)
    const after = resp.state.players[0]!
    expect(after.resources.grain).toBe(grainBefore)
    expect(getFenceCount(after)).toBe(fenceBefore)
    expect(after.supplyTokensConsumed?.fence).toBeUndefined()
  })

  it('does not exchange when only unbuilt fence tokens are held on E74', () => {
    const session = setupForHarvestField({ builtFences: 10, e74HeldFences: 5 })
    const before = session.getState().state.players[0]!
    const grainBefore = before.resources.grain
    const fenceBefore = getFenceCount(before)
    const resp = drainPending(session, /* accept */ true)
    const after = resp.state.players[0]!
    expect(after.resources.grain).toBe(grainBefore)
    expect(getFenceCount(after)).toBe(fenceBefore)
    expect(after.supplyTokensConsumed?.fence).toBeUndefined()
  })

  it('does not exchange when consumed fence tokens exhaust the reserve', () => {
    const sessionAccept = setupForHarvestField({ builtFences: 0, consumedFences: 15 })
    const before = sessionAccept.getState().state.players[0]!
    const grainBefore = before.resources.grain
    const fenceBefore = getFenceCount(before)

    const sessionDecline = setupForHarvestField({ builtFences: 0, consumedFences: 15 })
    const respDecline = drainPending(sessionDecline, /* accept */ false)
    const afterDecline = respDecline.state.players[0]!

    const respAccept = drainPending(sessionAccept, /* accept */ true)
    const afterAccept = respAccept.state.players[0]!

    expect(afterAccept.resources.grain).toBe(grainBefore)
    expect(getFenceCount(afterAccept)).toBe(fenceBefore)
    expect(afterAccept.supplyTokensConsumed?.fence).toBe(15)
    expect(afterAccept.resources.food - afterDecline.resources.food).toBe(0)
  })

  it('does not trigger when player has 0 grain', () => {
    const session = setupForHarvestField({ grain: 0 })
    const resp = drainPending(session, /* accept */ true)
    const after = resp.state.players[0]!
    expect(after.resources.grain).toBe(0)
    expect(getFenceCount(after)).toBe(4)
    expect(after.supplyTokensConsumed?.fence).toBeUndefined()
  })
})

describe('ae-negative-37-food', () => {
  const { sessions, save, setup, finish, completeRound, move, prerequisites, hand, buy, noSource, pasture, printed, fields, denyMinor, harvestChoice } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C054 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'C054_MarketBooth', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, {}); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.supplyTokensConsumed?.stable, 1); save('C054-N1-legal', r); const excluded = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, {}); st.players[0]!.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }]; }); denyMinor(excluded, card); save('C054-N1-prerequisite', excluded.getState()); });
  it('C054 N2 harvested grain and one reserve fence pay for five food before real feeding', () => { const card = 'C054_MarketBooth', s = setup(card, 4, st => { hand(st, card); fields(st, 1, [{ kind: 'grain', remaining: 1 }]); st.players[0]!.resources.food = 0; }); finish(s, buy(s, card)); move(s, 'forest'); move(s, 'reed-bank'); move(s, 'grain-seeds'); let r = confirmNext(s, s.getState()); save('C054-N2-real-purchase', r); r = harvestChoice(s, r, card, 1); r = finish(s, r, true); assert.equal(r.state.round, 5); assert.equal(r.state.players[0]!.resources.grain, 0); assert.equal(r.state.players[0]!.resources.food, 1); assert.equal(r.state.players[0]!.resources.begging, 0); assert.equal(r.state.players[0]!.supplyTokensConsumed?.fence, 1); save('C054-N2', r); });
  it('C054 N3 unavailable supply grain or fence decline and hand card cannot exchange built components', () => {
      for (const mode of ['grain', 'fences', 'decline', 'hand']) {
          const card = 'C054_MarketBooth', s = setup(card, 4, st => {
              st.players[0]!.resources.food = 4;
              st.players[0]!.resources.grain = mode === 'grain' ? 0 : 1;
              hand(st, card);
              if (mode === 'fences')
                  for (const [i, t] of [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 2 }, { row: 1, col: 3 }].entries())
                      pasture(st, [t], null, 0, false, `p${i}`);
          });
          let r: SessionResponse;
          if (mode === 'hand')
              r = completeRound(s, ['clay-pit', 'forest', 'reed-bank', 'grain-seeds']);
          else {
              finish(s, buy(s, card));
              move(s, 'forest');
              move(s, 'reed-bank');
              move(s, 'grain-seeds');
              r = confirmNext(s, s.getState());
          }
          if (mode !== 'decline') {
              noSource(r, card);
              assertRejectedUnchanged(s, () => s.resolveChoice(0, card));
          }
          r = finish(s, r, mode !== 'decline');
          assert.equal(r.state.players[0]!.resources.food, 0);
          assert.equal(r.state.players[0]!.resources.grain, mode === 'grain' ? 0 : 1);
          assert.equal(r.state.players[0]!.supplyTokensConsumed?.fence ?? 0, 0);
          assert.equal(r.state.players[0]!.supplyTokensConsumed?.stable ?? 0, mode === 'hand' ? 0 : 1);
          assert.equal(r.state.players[0]!.fenceSegments.length, mode === 'fences' ? 15 : 0);
          save(`C054-N3-${mode}`, r);
      }
  });
})
