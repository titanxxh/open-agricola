import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

import '../../shared/cards/E/E058_LunchtimeBeer'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit38Harvest from './_helpers/audit/ae-negative-38-harvest'

const CARD_ID = 'E058_LunchtimeBeer'

const setupHarvestRound = (round = 4) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = round
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 0
  })
  state.players[0]!.startPlayer = true
  state.players[1]!.startPlayer = false
  state.players[0]!.name = 'P1'
  state.players[1]!.name = 'P2'
  return { session, state }
}

const drainHarvest = (session: GameSession) => {
  let resp = session.performRoundEnd()
  while (resp.interaction.stateId === 'wait') {
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed') {
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
    } else if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      const interaction = resp.interaction.stateId === 'wait' ? resp.interaction : null
      resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', interaction?.zones ?? [])
    } else if (resp.interaction.stateId === 'wait') {
      const opts = resp.interaction.request.options ?? []
      const next = opts.find((o) => o.value === '__skip__') ?? opts[0]
      if (!next) break
      resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, next.value)
    } else {
      break
    }
  }
  return resp
}

describe('E058_LunchtimeBeer onStartHarvest flow shape', () => {
  it('returns optional SEQ with [gain food:1, special-effect set-extra-data]', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onStartHarvest!(state, player)) as Extract<ActionFlow, { type: 'seq' }>
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(2)

    const gainLeaf = flow.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(gainLeaf.type).toBe('leaf')
    expect(gainLeaf.actionId).toBe('gain')
    expect(gainLeaf.params).toEqual({ food: 1 })

    const specialLeaf = flow.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(specialLeaf.type).toBe('leaf')
    expect(specialLeaf.actionId).toBe('special-effect')
    expect(specialLeaf.params).toEqual({
      kind: 'set-extra-data',
      key: 'passFieldAndBreedRound',
      value: 4,
    })
    expect(specialLeaf.sourceCard).toBe(CARD_ID)
  })

  it('emits special-effect with state.round value (round 7 → value 7)', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 7
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onStartHarvest!(state, player)) as Extract<ActionFlow, { type: 'seq' }>
    const specialLeaf = flow.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect((specialLeaf.params as { value: unknown }).value).toBe(7)
  })
})

describe('E058_LunchtimeBeer harvest-phase skip integration', () => {
  it('accepting the SEQ at round 4: +1 food, passFieldAndBreedRound=4, reap skipped, breed skipped', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    const p2 = state.players[1]!

    p1.minorPlayed.push(CARD_ID)
    // Player 1 has reapable grain on a field — only counted if reap fires.
    p1.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    // Player 1 has 2 sheep in pasture so breeding would normally yield +1.
    p1.pastures = [
      {
        id: 'p1-pasture',
        size: 2,
        tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
    ]
    p1.resources.sheep = 2
    p1.resources.food = 5 // enough to feed family without begging
    // Player 2: no fields / no animals — irrelevant baseline.
    p2.resources.food = 5
    session.loadState(state)

    let resp = session.performRoundEnd()
    // First we should see an optional SEQ choice from E58 onStartHarvest.
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Accept (non-__skip__) — there should be exactly one accept option.
    const accept = resp.interaction.request.options!.find((o) => o.value !== '__skip__')!
    resp = session.resolveChoice(0, accept.value)

    // Drain remaining feed/reorg prompts to finish the harvest cycle.
    resp = drainHarvest(session)

    const finalP1 = resp.state.players[0]!
    expect(finalP1.cardStates?.[CARD_ID]?.extraData?.passFieldAndBreedRound).toBe(4)
    // +1 food from accept (food was 5, then -2 feed × 1 family = 3, +1 from E58 = 4).
    // We assert the flag pathway (resource math depends on family-size internals).
    expect(finalP1.resources.food).toBeGreaterThanOrEqual(4)
    // Field stack untouched (reap skipped).
    expect(finalP1.fields[0]!.stacks[0]!.remaining).toBe(2)
    // Sheep count unchanged (breeding skipped).
    expect(finalP1.resources.sheep).toBe(2)
    // pasture animalCount also unchanged.
    expect(finalP1.pastures[0]!.animalCount).toBe(2)
  })

  it('declining the optional SEQ: no flag, normal reap and breed', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    p1.minorPlayed.push(CARD_ID)
    p1.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    p1.resources.food = 5
    state.players[1]!.resources.food = 5
    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const skip = resp.interaction.request.options!.find((o) => o.value === '__skip__')!
    resp = session.resolveChoice(0, skip.value)

    resp = drainHarvest(session)

    const finalP1 = resp.state.players[0]!
    expect(finalP1.cardStates?.[CARD_ID]?.extraData?.passFieldAndBreedRound).toBeUndefined()
    // Reap fired — grain stack decremented.
    expect(finalP1.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(finalP1.resources.grain).toBeGreaterThanOrEqual(1)
  })

  it('player without E58: no SEQ prompt, harvest runs normally', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    // Do NOT push E58 into minorPlayed.
    p1.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]
    p1.resources.food = 5
    state.players[1]!.resources.food = 5
    session.loadState(state)

    const resp = drainHarvest(session)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.passFieldAndBreedRound).toBeUndefined()
    // Reap fired — grain went up by 1 (and stack of 1 was fully consumed, so
    // the stack may be empty or removed by reap).
    expect(resp.state.players[0]!.resources.grain).toBeGreaterThanOrEqual(1)
  })

  it('flag is round-scoped: round-4 accept does not skip round-7', () => {
    const { session, state } = setupHarvestRound(7)
    const p1 = state.players[0]!
    p1.minorPlayed.push(CARD_ID)
    // Pre-set a stale flag from round 4 — should NOT cause round-7 skip
    // because hasPassFieldAndBreed compares against state.round.
    p1.cardStates = {
      [CARD_ID]: { extraData: { passFieldAndBreedRound: 4 } },
    }
    p1.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]
    p1.resources.food = 5
    state.players[1]!.resources.food = 5
    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    // Decline — confirm reap still fires (no stale-flag skip).
    const skip = resp.interaction.request.options!.find((o) => o.value === '__skip__')!
    resp = session.resolveChoice(0, skip.value)
    resp = drainHarvest(session)

    expect(resp.state.players[0]!.resources.grain).toBeGreaterThanOrEqual(1)
  })

  it('only the flagged player skips: 2P with one accept + one no-card', () => {
    const { session, state } = setupHarvestRound(4)
    const p1 = state.players[0]!
    const p2 = state.players[1]!
    p1.minorPlayed.push(CARD_ID)
    p1.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]
    p2.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }]
    p1.resources.food = 5
    p2.resources.food = 5
    session.loadState(state)

    let resp = session.performRoundEnd()
    // E58 prompt for P1 first (start player).
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options!.find((o) => o.value !== '__skip__')!
    resp = session.resolveChoice(0, accept.value)
    resp = drainHarvest(session)

    // P1 reap skipped (grain stack still present at 1).
    expect(resp.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    // P2 reap fired — gained at least 1 grain.
    expect(resp.state.players[1]!.resources.grain).toBeGreaterThanOrEqual(1)
  })
})

describe('ae-negative-38-harvest', () => {
  const { sessions, save, ok, pendingCard, finish, progress, buy, QUIET, beer, beerAccept } = audit38Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E058 N1 actual free purchase and accepting the real harvest skips only owner field and breeding phases while feeding and opponent normal harvest still occur', () => { const b = beer(false), bought = finish(b, buy(b, 'E058_LunchtimeBeer')); assert.ok(bought.state.players[0]!.minorPlayed.includes('E058_LunchtimeBeer')); const s = beer(), p = progress(s, 12, 'E058_LunchtimeBeer', QUIET), r = finish(s, beerAccept(s, p)); assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.grain, r.state.players[0]!.fields[0]!.stacks[0]!.remaining, r.state.players[0]!.resources.cattle, r.state.players[0]!.pastures[0]!.animalCount], [97, 0, 3, 2, 2]); assert.deepEqual([r.state.players[1]!.resources.grain, r.state.players[1]!.fields[0]!.stacks[0]!.remaining, r.state.players[1]!.resources.cattle], [2, 2, 3]); save('E058-N1', { bought, p, r }); });
  it('E058 N2 declining or holding the beer preserves normal harvest and accepting one harvest cannot suppress the later harvest when it is declined', () => {
      const rows = [];
      for (const played of [true, false] as const) {
          const s = beer(played), p = progress(s, 12, 'E058_LunchtimeBeer', QUIET), r = finish(s, p);
          assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.fields[0]!.stacks[0]!.remaining, r.state.players[0]!.resources.cattle], [96, 2, 3]);
          if (!played)
              assert.equal(pendingCard(p, 'E058_LunchtimeBeer'), false);
          rows.push({ p, r });
      }
      const t = beer(), q = progress(t, 12, 'E058_LunchtimeBeer', QUIET), first = finish(t, beerAccept(t, q)), p2 = progress(t, 14, 'E058_LunchtimeBeer', QUIET), r2 = finish(t, p2);
      assert.deepEqual([r2.state.players[0]!.resources.food, r2.state.players[0]!.fields[0]!.stacks[0]!.remaining, r2.state.players[0]!.resources.cattle], [93, 2, 3]);
      save('E058-N2', { rows, q, first, p2, r2 });
  });
  it('E058 N3 skip does not skip a real feeding shortage and no nonharvest boundary can offer beer', () => { const s = beer(true, 2, 1), p = progress(s, 12, 'E058_LunchtimeBeer', QUIET), feed = finish(s, beerAccept(s, p), '__feed__'); assert.ok(feed.interaction.stateId === 'wait' && feed.interaction.request.kind === 'feed'); assert.deepEqual([feed.interaction.request.foodUsed, feed.interaction.request.remaining], [3, 1]); const recipe = feed.interaction.request.exchangeCatalog?.find(e => e.from.grain === 1 && e.to.food === 1); assert.ok(recipe); const r = finish(s, ok(s.resolveChoice(0, 'confirm', { selections: [{ sourceId: recipe.sourceId, exchangeIndex: recipe.exchangeIndex, count: 1, sourceName: recipe.sourceId }] }))); assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.grain, r.state.players[0]!.resources.begging, r.state.players[0]!.resources.cattle], [0, 0, 0, 2]); const t = beer(true, 100, 0, 12), next = progress(t, 13, 'E058_LunchtimeBeer', QUIET); assert.equal(pendingCard(next, 'E058_LunchtimeBeer'), false); assert.equal(next.state.players[0]!.resources.food, 100); save('E058-N3', { p, feed, r, next }); });
})
