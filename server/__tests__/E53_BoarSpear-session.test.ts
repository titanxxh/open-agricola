import { describe, expect, it, afterEach } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getPastureCapacity } from '../../shared/domain/pasture'
import { E053_BoarSpear_impl } from '../../shared/cards/E/E053_BoarSpear'
import { executeCardListener } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/E/E053_BoarSpear'
import '../../shared/cards/E/E085_MasterTanner'
import '../../shared/cards/C/C148_MudWallower'
import '../../shared/cards/B/B137_Wholesaler'
import assert from 'node:assert/strict'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'

const CARD_ID = 'E053_BoarSpear'
const E085_ID = 'E085_MasterTanner'
const C148_ID = 'C148_MudWallower'
const B137_ID = 'B137_Wholesaler'

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { boar: 1 },
  from: { kind: 'actionSpace', spaceId: 'pig-market' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

type AnimalZone = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable' | 'card'
  cardId?: string
  animalType: 'sheep' | 'boar' | 'cattle' | null
  animalCount: number
  capacity: number
}

const setup = (opts?: { boar?: number; food?: number; withE85?: boolean }) => {
  const session = createWorkSession({ seed: 42, options: { playerCount: 4 }, configure(state) {
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
  } })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 0,
    boar: opts?.boar ?? 0,
  }
  player.minorPlayed.push(CARD_ID)
  if (opts?.withE85) {
    player.occupationPlayed.push(E085_ID)
  }

  session.loadState(state)
  return { session, state: session.getState().state }
}

const placeBoarInHouse = (zones: AnimalZone[]): AnimalZone[] =>
  zones.map((z) =>
    z.zoneType === 'house'
      ? { ...z, animalType: 'boar' as const, animalCount: Math.min(1, z.capacity) }
      : z,
  )

const c148BoarZone = (animalCount: number) => ({
  id: `card:${C148_ID}`,
  zoneType: 'card',
  animalType: 'boar',
  animalCount,
})

const driveToCompletion = (
  session: GameSession,
  initialResp: ReturnType<GameSession['takeAction']>,
  acceptE53Trade: boolean,
) => {
  let resp = initialResp
  // First, satisfy animalReorg by placing boar in house
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
    const p = resp.state.players[0]!
    const zones: AnimalZone[] = [
      { id: 'house:1-0', zoneType: 'house', animalType: null, animalCount: 0, capacity: 1 },
      ...p.pastures.map((pasture) => ({
        id: pasture.id,
        zoneType: 'pasture' as const,
        animalType: pasture.animalType ?? null,
        animalCount: pasture.animalCount,
        capacity: getPastureCapacity(p, pasture),
      })),
    ]
    resp = session.resolveChoice(0, 'confirm', placeBoarInHouse(zones) as unknown as Record<string, unknown>)
  }
  // Then resolve E53 prompt chain
  let safety = 30
  while (safety-- > 0 && resp.interaction.stateId === 'wait') {
    const opts = (resp.interaction.request.options ?? []) as { value: string; sourceCard?: string }[]
    if (acceptE53Trade) {
      // Accept E53 optional and pick trade
      const e53Trade = opts.find((o) => o.value.startsWith('trade:'))
      if (e53Trade) {
        resp = session.resolveChoice(0, e53Trade.value)
        continue
      }
      const e53Accept = opts.find((o) => o.sourceCard === CARD_ID && o.value !== '__skip__')
      if (e53Accept) {
        resp = session.resolveChoice(0, e53Accept.value)
        continue
      }
    } else {
      // Reject path: skip optional prompts only.
      const skip = opts.find((o) => o.value === '__skip__')
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
        continue
      }
    }
    // Otherwise advance any non-skip / non-cancel
    const nonSkip = opts.find((o) => o.value !== '__skip__' && o.value !== 'cancel')
    if (nonSkip) {
      resp = session.resolveChoice(0, nonSkip.value)
      continue
    }
    const skipOrCancel = opts.find((o) => o.value === '__skip__')
    if (skipOrCancel) {
      resp = session.resolveChoice(0, skipOrCancel.value)
      continue
    }
    break
  }
  return resp
}

describe('E053_BoarSpear session - exchange-based PIG -> 4 FOOD', () => {
  it('does not fire on non-boar-yielding action', () => {
    const { session } = setup()
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const opts = (resp.interaction.request.options ?? []) as { sourceCard?: string; value: string }[]
      const hasE53 = opts.some((o) => o.sourceCard === CARD_ID)
      expect(hasE53).toBe(false)
    }
    expect(resp.state.players[0]!.resources.boar).toBe(0)
  })

  it('after gaining 1 boar via pig-market, prompt fires; accept -> trade -> +4 food', () => {
    const { session, state } = setup({ food: 0 })
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1
    session.loadState(state)

    const initial = session.takeAction(0, 'pig-market')
    expect(initial.ok).toBe(true)
    expect(initial.interaction.stateId).toBe('wait')

    const resp = driveToCompletion(session, initial, /* acceptE53Trade */ true)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  it('with 2 boar collected, only those retained after reorg are exchangeable (+4 food per boar)', () => {
    // The default player farm has only the starting house (1 boar capacity) and
    // no extra pasture/stable; therefore only 1 of the 2 collected boar can
    // remain after the animalReorg step. E53 then converts that 1 boar -> 4 food.
    const { session, state } = setup({ food: 0 })
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 2
    session.loadState(state)

    const initial = session.takeAction(0, 'pig-market')
    expect(initial.ok).toBe(true)

    const resp = driveToCompletion(session, initial, /* acceptE53Trade */ true)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  it('reject SEQ -> boar retained, no exchange', () => {
    const { session, state } = setup({ food: 0 })
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1
    session.loadState(state)

    const initial = session.takeAction(0, 'pig-market')
    const resp = driveToCompletion(session, initial, /* acceptE53Trade */ false)
    // boar stayed in house (1 placed) so player.resources.boar reflects boar-on-board after reorg
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('accepting action-space boar conversion preserves C148-held boar', () => {
    const { session, state } = setup({ food: 0 })
    const player = state.players[0]!
    player.occupationPlayed.push(C148_ID)
    player.cardStates = {
      ...(player.cardStates ?? {}),
      [C148_ID]: { counters: { counter: 0, held: 1 } },
    }
    player.resources.boar = 1
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, B137_ID)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionAnimalReorg')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      { id: `card:${C148_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    resp = driveToCompletion(session, resp, /* acceptE53Trade */ true)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(4)
    expect(after.resources.boar).toBe(1)
    expect((Object.values(after.houseAnimals)[0] ?? null)).toBeNull()
    expect(Object.values(after.houseAnimals).length).toBe(0)
    expect(after.cardStates?.[C148_ID]?.counters?.held).toBe(1)
  })

  it('accepting C148-provided boar conversion consumes C148-held boar', () => {
    const { session, state } = setup({ food: 0 })
    const player = state.players[0]!
    player.occupationPlayed.push(C148_ID)
    player.cardStates = {
      ...(player.cardStates ?? {}),
      [C148_ID]: { counters: { counter: 3, held: 0 } },
    }
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, C148_ID)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionAnimalReorg')

    resp = session.resolveChoice(0, 'confirm', [
      c148BoarZone(1),
    ] as unknown as Record<string, unknown>)

    resp = driveToCompletion(session, resp, /* acceptE53Trade */ true)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(4)
    expect(after.resources.boar).toBe(0)
    expect(after.cardStates?.[C148_ID]?.counters?.held).toBe(0)
  })

  it('declining action-space boar conversion leaves C148-held boar unchanged', () => {
    const { session, state } = setup({ food: 0 })
    const player = state.players[0]!
    player.occupationPlayed.push(C148_ID)
    player.cardStates = {
      ...(player.cardStates ?? {}),
      [C148_ID]: { counters: { counter: 0, held: 1 } },
    }
    player.resources.boar = 1
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)
    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      c148BoarZone(1),
    ] as unknown as Record<string, unknown>)

    resp = driveToCompletion(session, resp, /* acceptE53Trade */ false)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(0)
    expect(after.resources.boar).toBe(2)
    expect((Object.values(after.houseAnimals)[0] ?? null)).toBe('boar')
    expect(Object.values(after.houseAnimals).length).toBe(1)
    expect(after.cardStates?.[C148_ID]?.counters?.held).toBe(1)
  })

  it('accepting B137-provided boar conversion preserves C148-held boar', () => {
    const { session, state } = setup({ food: 0 })
    const player = state.players[0]!
    player.occupationPlayed.push(C148_ID, B137_ID)
    player.cardStates = {
      ...(player.cardStates ?? {}),
      [C148_ID]: { counters: { counter: 0, held: 1 } },
      [B137_ID]: {
        extraData: {
          wholesaler: {
            vegetableTaken: false,
            boarTaken: false,
            stoneTaken: false,
            cattleTaken: false,
          },
        },
      },
    }
    player.resources.boar = 1
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1
    player.pastures = [{ id: 'boar-pasture', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: 'boar', animalCount: 0 }]
    session.loadState(state)

    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)
    const placeUnheldBoar = () => {
      resp = resolveTriggerIfPresent(session, resp, B137_ID)
      expect(resp.state.players[0]!.resources.boar).toBe(2)
      if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'animal-reorg') {
        throw new Error('Expected placement for one newly acquired boar')
      }
      resp = session.resolveChoice(0, 'confirm', { zones: resp.interaction.request.zones.map(zone => {
        const animalCount = zone.id === 'boar-pasture' || zone.id === `card:${C148_ID}` ? 1 : 0
        return { ...zone, animalType: animalCount > 0 ? 'boar' : null, animalCount }
      }) })
      expect(resp.ok, resp.error).toBe(true)
    }
    placeUnheldBoar()
    resp = driveToCompletion(session, resp, /* acceptE53Trade */ true)
    expect(resp.state.players[0]!.resources.food).toBe(4)
    placeUnheldBoar()
    resp = driveToCompletion(session, resp, /* acceptE53Trade */ true)
    const after = resp.state.players[0]!
    expect(resp.ok, resp.error).toBe(true)
    expect(after.resources.food).toBe(8)
    expect(after.resources.boar).toBe(1)
    expect((Object.values(after.houseAnimals)[0] ?? null)).toBeNull()
    expect(Object.values(after.houseAnimals).length).toBe(0)
    expect(after.cardStates?.[C148_ID]?.counters?.held).toBe(1)
    expect(resp.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === B137_ID))
      .toEqual([expect.objectContaining({ resources: { boar: 1 } })])
  })

  it('does not fire during breeding phase', () => {
    const { session: ruleSession, state } = setup({ food: 0 })
    const player = state.players[0]!
    player.id = 'p1'
    state.roundPhase = 'breeding'

    const listener = E053_BoarSpear_impl.listeners[0]!
    const ctx = {
      state,
      player,
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved()],
      actionEvents: [moved()],
      space: state.actionSpaces[0],
    }

    expect(ruleSession.withCtx(() => executeCardListener(listener, ctx as never))).toBeUndefined()
  })

  it('does not infer a new acquisition from transaction or global events without host action events', () => {
    const { session: ruleSession, state } = setup({ food: 0 })
    const player = state.players[0]!
    player.id = 'p1'
    state.events = [
      { type: 'worker.placed', actorPlayerId: 'p1', workerId: 'w1', spaceId: 'pig-market' } as never,
      moved() as never,
    ]

    const listener = E053_BoarSpear_impl.listeners[0]!
    const ctx = {
      state,
      player,
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { boar: 1 } },
      transactionEvents: [moved()],
      space: state.actionSpaces[0],
    }

    expect(ruleSession.withCtx(() => executeCardListener(listener, ctx as never))).toBeUndefined()
  })

  it('coupling with E85 MasterTanner: exchange dispatch fires E85 listeners', () => {
    const { session, state } = setup({ food: 0, withE85: true })
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1
    session.loadState(state)

    const initial = session.takeAction(0, 'pig-market')
    const resp = driveToCompletion(session, initial, /* acceptE53Trade */ true)
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    // Boar exchange yields 4 food. E85 listens to exchange action;
    // its push-food behaviour requires the player to spend 1 food, leaving >=3.
    expect(resp.state.players[0]!.resources.food).toBeGreaterThanOrEqual(3)
  })
})

describe('ae-negative-37-food', () => {
  const { sessions, ok, options, save, setup, source, finish, next, completeRound, take, move, prerequisites, hand, buy, accept, pasture, animalKeep, printed, denyMinor, convertBoar } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E053 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'E053_BoarSpear', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "wood": 1, "stone": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 1); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.stone, 0); save('E053-N1-legal', r); const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "wood": 0, "stone": 1 }); }); denyMinor(t, card); save('E053-N1-short', t.getState()); });
  it('E053 N2 rejects excessive quantities atomically and converts only newly obtained pigs on retry', () => {
      for (const n of [1, 2]) {
          const card = 'E053_BoarSpear', s = setup(card, 14, st => { pasture(st, [{ row: 0, col: 3 }, { row: 0, col: 4 }], 'boar', 2); st.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = n; });
          const r = convertBoar(s, take(s, 'pig-market'), n, `E053-N2-${n}`);
          assert.equal(r.state.players[0]!.resources.food, 40 + 4 * n);
          assert.equal(r.state.players[0]!.resources.boar, 2);
          assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 2);
          save(`E053-N2-${n}`, r);
      }
      const outcomes: unknown[] = [];
      for (const n of [1, 2]) {
          const s = setup('E053_BoarSpear', 14, st => { pasture(st, [{ row: 0, col: 3 }, { row: 0, col: 4 }], 'boar', 2); st.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = n; });
          let r = take(s, 'pig-market');
          for (let guard = 0; guard < 16; guard++) {
              if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
                  r = animalKeep(s, r, req => {
                      for (const z of req.zones) {
                          z.animalType = z.zoneType === 'pasture' ? 'boar' : null;
                          z.animalCount = z.zoneType === 'pasture' ? r.state.players[0]!.resources.boar : 0;
                      }
                  });
                  continue;
              }
              r = source(s, r, 'E053_BoarSpear');
              const trade = options(r).find(o => o.value.startsWith('trade:'));
              if (trade) {
                  save(`E053-N2-force-before-${n}`, r);
                  const result = assertRejectedUnchanged(s, () =>
                      s.resolveChoice(0, `bulk:${trade.value.split(':')[1]}=${n + 1}`));
                  outcomes.push({ ok: result.ok, food: result.state.players[0]!.resources.food, pig: result.state.players[0]!.resources.boar });
                  save(`E053-N2-force-after-${n}`, result);
                  const retried = finish(s, ok(s.resolveChoice(0, `bulk:${trade.value.split(':')[1]}=${n}`)));
                  assert.equal(retried.state.players[0]!.resources.food, 40 + 4 * n);
                  assert.equal(retried.state.players[0]!.resources.boar, 2);
                  assert.equal(retried.state.players[0]!.pastures[0]!.animalCount, 2);
                  break;
              }
              r = accept(s, r, 'E053_BoarSpear');
          }
          assert.equal(outcomes.length, n);
      }
      assert.deepEqual(outcomes, [{ ok: false, food: 40, pig: 3 }, { ok: false, food: 40, pig: 4 }]);
  });
  it('E053 N3 decline hand opponent unrelated and real breeding cannot convert existing pigs for four food', () => {
      for (const mode of ['decline', 'hand', 'opponent', 'unrelated']) {
          const card = 'E053_BoarSpear', s = setup(card, 14, st => {
              pasture(st, [{ row: 0, col: 3 }]);
              st.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = 1;
              if (mode === 'hand')
                  hand(st, card);
              if (mode === 'opponent')
                  st.currentPlayerIndex = 1;
          });
          const r = finish(s, take(s, mode === 'unrelated' ? 'forest' : 'pig-market'), mode !== 'decline');
          assert.equal(r.state.players[0]!.resources.food, 40);
          assert.equal(r.state.players[mode === 'opponent' ? 1 : 0]!.resources.boar, mode === 'unrelated' ? 0 : 1);
          save(`E053-N3-${mode}`, r);
      }
      const card = 'E053_BoarSpear', s = setup(card, 9, st => pasture(st, [{ row: 0, col: 3 }, { row: 0, col: 4 }], 'boar', 2));
      const r = finish(s, completeRound(s, ['clay-pit', 'forest', 'reed-bank', 'grain-seeds']), true);
      assert.equal(r.state.round, 10);
      assert.equal(r.state.players[0]!.resources.boar, 3);
      assert.equal(r.state.players[0]!.resources.food, 36);
      save('E053-N3-breeding', r);
  });
  it('E053 N4 pigs gained by a real nonfood sheep exchange can immediately convert without spending the older pig', () => { const card = 'E053_BoarSpear', s = setup(card, 14, st => { pasture(st, [{ row: 0, col: 3 }], 'boar', 1, false, 'p1'); pasture(st, [{ row: 0, col: 4 }], 'sheep', 1, false, 'p2'); st.players[0]!.occupationPlayed = ['B104_SheepWalker']; hand(st, card); Object.assign(st.players[0]!.resources, { wood: 1, stone: 1 }); }); finish(s, buy(s, card)); move(s, 'forest'); next(s); save('E053-N4-real-purchase-history', s.getState()); let r = ok(s.takeAnytimeAction(0, 'exchange')); const opt = options(r).find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.sheep === 1 && o.effectPreview.resourcesGained?.boar === 1); assert.ok(opt); r = ok(s.resolveChoice(0, opt.value)); save('E053-N4-after-sheep-exchange', r); r = convertBoar(s, r, 1, 'E053-N4'); save('E053-N4', r); assert.equal(r.state.players[0]!.resources.sheep, 0); assertRuleOutcome({ food: r.state.players[0]!.resources.food, pig: r.state.players[0]!.resources.boar }, { food: 44, pig: 1 }); });
})
