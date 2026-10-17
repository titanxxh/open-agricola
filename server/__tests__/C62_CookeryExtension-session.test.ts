import { describe, it, expect, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C062_CookeryExtension'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from './_helpers/negative-rule-audit'

const C62 = 'C062_CookeryExtension'
const FIREPLACE1 = 'Major_Fireplace1'
const COOKING_HEARTH1 = 'Major_CookingHearth1'

const setupTwoPlayer = () => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.players[0]!.name = 'P1'
  state.players[1]!.name = 'P2'
  return { session, state }
}

const seedC62 = (state: ReturnType<GameSession['getState']>['state'], playerId = 'p1') => {
  const player = state.players.find((p) => p.id === playerId)!
  player.minorPlayed = [...(player.minorPlayed ?? []), C62]
  player.cardStates = {
    ...(player.cardStates ?? {}),
    [C62]: { extraData: { usedCookeryIds: [] } },
  }
}

const seedCookery = (
  state: ReturnType<GameSession['getState']>['state'],
  cardId: string,
  playerId = 'p1',
) => {
  const player = state.players.find((p) => p.id === playerId)!
  if (cardId.startsWith('Major_')) {
    player.improvements = [...(player.improvements ?? []), cardId]
  } else {
    player.minorPlayed = [...(player.minorPlayed ?? []), cardId]
  }
}

describe('C62 CookeryExtension', () => {
  it('derives doubled vegetable→4food trade from Major_Fireplace1 in harvest window', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    const trades = session.withCtx(() => getExchangesInWindow(p1, 'harvest', state))
    const derived = trades.filter((t) => t.sourceId?.startsWith(`${C62}::`))
    expect(derived).toContainEqual(
      expect.objectContaining({
        from: { vegetable: 1 },
        to: expect.objectContaining({ food: 4 }),
        sourceId: `${C62}::${FIREPLACE1}`,
        max: 1,
      }),
    )
  })

  it('removes all derived trades from a cookery once any one of its derived entries is used', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!

    p1.cardStates![C62]!.extraData!.usedCookeryIds = [FIREPLACE1]

    const trades = session.withCtx(() => getExchangesInWindow(p1, 'harvest', state))
    const derivedFromFireplace = trades.filter(
      (t) => t.sourceId === `${C62}::${FIREPLACE1}`,
    )
    expect(derivedFromFireplace).toHaveLength(0)
  })

  it('two cookeries each independently usable once', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    seedCookery(state, COOKING_HEARTH1)
    session.loadState(state)
    const p1 = state.players[0]!

    let trades = session.withCtx(() => getExchangesInWindow(p1, 'harvest', state))
    expect(trades.some((t) => t.sourceId === `${C62}::${FIREPLACE1}`)).toBe(true)
    expect(trades.some((t) => t.sourceId === `${C62}::${COOKING_HEARTH1}`)).toBe(true)

    p1.cardStates![C62]!.extraData!.usedCookeryIds = [FIREPLACE1]
    trades = session.withCtx(() => getExchangesInWindow(p1, 'harvest', state))
    expect(trades.some((t) => t.sourceId === `${C62}::${FIREPLACE1}`)).toBe(false)
    expect(trades.some((t) => t.sourceId === `${C62}::${COOKING_HEARTH1}`)).toBe(true)
  })

  it('does not derive grain bake-bread entries (only anytime + valid-from)', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    const trades = session.withCtx(() => getExchangesInWindow(p1, 'harvest', state))
    const grainDerived = trades.filter(
      (t) => t.sourceId?.startsWith(`${C62}::`) && t.from?.grain !== undefined,
    )
    expect(grainDerived).toHaveLength(0)
  })

  it('does not inject derived trades in non-harvest windows', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    const anytime = session.withCtx(() => getExchangesInWindow(p1, 'anytime', state))
    const bakeBread = session.withCtx(() => getExchangesInWindow(p1, 'bake-bread', state))
    expect(anytime.some((t) => t.sourceId?.startsWith(`${C62}::`))).toBe(false)
    expect(bakeBread.some((t) => t.sourceId?.startsWith(`${C62}::`))).toBe(false)
  })

  it('onStartHarvest resets usedCookeryIds', async () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    p1.cardStates![C62]!.extraData!.usedCookeryIds = [FIREPLACE1]

    const impl = (
      await import('../../shared/cards/C/C062_CookeryExtension')
    ).C062_CookeryExtension_impl
    session.withCtx(() => impl.effect!.onStartHarvest!(state, p1))
    expect(p1.cardStates![C62]!.extraData!.usedCookeryIds).toEqual([])
  })

  it('produces no derived trades when player has no cookery cards', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    session.loadState(state)
    const p1 = state.players[0]!
    const trades = session.withCtx(() => getExchangesInWindow(p1, 'harvest', state))
    const derived = trades.filter((t) => t.sourceId?.startsWith(`${C62}::`))
    expect(derived).toHaveLength(0)
  })

  it('coexists with native cookery anytime trades', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    const anytime = session.withCtx(() => getExchangesInWindow(p1, 'anytime', state))
    const fireplaceVeg = anytime.find(
      (t) => t.sourceId === FIREPLACE1 && t.from?.vegetable === 1,
    )
    expect(fireplaceVeg?.to.food).toBe(2)
  })
})

describe('C62 + harvest feed integration', () => {
  it('does not open a feed wait when its only derived harvest trades are unaffordable', () => {
    const session = new GameSession(62)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.roundPhase = 'work'
    for (const player of state.players) {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
      player.resources.food = 0
    }
    const player = state.players[0]!
    setActiveWorkerCount(player, 1)
    seedC62(state, player.id)
    seedCookery(state, FIREPLACE1, player.id)
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'feed'
      && response.interaction.playerIndex === 0).toBe(false)
    expect(response.state.players[0]!.resources.begging).toBe(2)
  })

  const setupFeed = () => {
    const session = new GameSession(6200, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 4
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
      player.resources.food = 20
    })
    const player = state.players[0]!
    setActiveWorkerCount(player, 1)
    player.resources.food = 0
    player.resources.vegetable = 1
    seedC62(state, player.id)
    seedCookery(state, FIREPLACE1, player.id)
    session.loadState(state)
    let offered = session.performRoundEnd()
    if (
      offered.interaction.stateId === 'wait'
      && offered.interaction.request.kind === 'choice'
      && offered.interaction.request.options?.some((option) => option.value === '__skip__')
    ) {
      offered = session.resolveChoice(offered.interaction.playerIndex, '__skip__')
    }
    expect(offered.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'feed' },
    })
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'feed') {
      throw new Error('expected C62 harvest feed')
    }
    const exchange = offered.interaction.request.exchangeCatalog?.find((entry) =>
      entry.sourceId === `${C62}::${FIREPLACE1}` && entry.from.vegetable === 1,
    )
    expect(exchange).toMatchObject({ from: { vegetable: 1 }, to: { food: 4 }, max: 1 })
    return { session, offered, exchange: exchange! }
  }

  it('executes the doubled exchange through the authoritative feed command', () => {
    const { session, exchange } = setupFeed()
    const response = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: exchange.sourceId, exchangeIndex: exchange.exchangeIndex, count: 1,
    }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 2, begging: 0 })
    expect(response.state.players[0]!.cardStates?.[C62]?.extraData?.usedCookeryIds).toEqual([FIREPLACE1])
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'harvest.feedConverted', source: `${C62}::${FIREPLACE1}`,
      cost: { vegetable: 1 }, food: { food: 4 },
    }))
  })

  it('rejects a forged or over-limit derived source atomically and permits retry', () => {
    const { session, offered, exchange } = setupFeed()
    const before = JSON.stringify({ state: offered.state, interaction: offered.interaction })
    const forged = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: `${C62}::Major_Fireplace2`, exchangeIndex: exchange.exchangeIndex, count: 1,
    }] })
    expect(forged.ok).toBe(false)
    expect(JSON.stringify({ state: forged.state, interaction: forged.interaction })).toBe(before)

    const duplicate = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: exchange.sourceId, exchangeIndex: exchange.exchangeIndex, count: 1 },
      { sourceId: exchange.sourceId, exchangeIndex: exchange.exchangeIndex, count: 1 },
    ] })
    expect(duplicate.ok).toBe(false)
    expect(JSON.stringify({ state: duplicate.state, interaction: duplicate.interaction })).toBe(before)

    const accepted = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: exchange.sourceId, exchangeIndex: exchange.exchangeIndex, count: 1,
    }] })
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.resources.vegetable).toBe(0)
  })
})

describe('ae-negative-39-native', () => {
  const sessions: GameSession[] = [];
  let pause: ((r: SessionResponse) => boolean) | undefined;
  const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/39/oa-probes';
  const traces: unknown[] = [];
  const order = ['sheep-market', 'fencing', 'major-improvement', 'grain-utilization', 'wish-children', 'house-redevelopment', 'western-quarry', 'pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry', 'cultivation', 'urgent-wish-children', 'farm-redevelopment'];
  const prerequisites: Record<string, number> = { D064_BakingCourse: 1, E062_SourDough: 3 };
  function ok(r: SessionResponse): SessionResponse { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return JSON.parse(JSON.stringify(r)); }
  function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ commands: traces, value }, null, 2)); }
  function make(card: string, configure: (st: GameState) => void = () => { }, played = true, round = 5) {
      const s = createWorkSession({ seed: 4239, options: { playerCount: 2 }, configure(st) {
              st.round = round;
              st.roundActionOrder = [...order];
              for (const [p, i] of st.players.map((p, i): [
                  PlayerState,
                  number
              ] => [p, i])) {
                  p.occupationHand = i === 0 ? ['A125_Priest', 'A102_Grocer'] : ['A116_WoodCutter', 'A123_FrameBuilder'];
                  p.minorHand = i === 0 ? ['B004_WoodPile', 'A006_StorageBarn'] : ['__test_placeholder__'];
                  p.occupationPlayed = [];
                  p.minorPlayed = [];
                  p.improvements = [];
                  p.cardStates = {};
                  Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 100, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 });
              }
              const p = st.players[0]!;
              if (played) {
                  p.minorPlayed = [card];
                  occupations(p, prerequisites[card] ?? 0);
              }
              else
                  p.minorHand.unshift(card);
              configure(st);
              for (const owner of st.players)
                  for (const id of [...owner.minorHand, ...owner.minorPlayed, ...owner.occupationHand, ...owner.occupationPlayed])
                      if (id !== '__test_placeholder__')
                          { const path=new URL(`../../shared/cards/${id[0]}/${id}.ts`, import.meta.url);assert.ok(fs.existsSync(path), `Unknown fixture card ${id}`);const min=/players:\s*['"](\d+)\+/.exec(fs.readFileSync(path,'utf8'));if(min)assert.ok(Number(min[1])<=2,`Fixture card ${id} exceeds 2p`);}
              if (!played)
                  assert.ok(p.minorHand.includes(card));
          } });
      sessions.push(s);
      return s;
  }
  function take(s: GameSession, a: number, space: string) { const n = order.indexOf(space) + 1; assert.ok(!n || n <= s.state.round); traces.push({ command: 'takeAction', actor: a, space, round: s.state.round }); return ok(s.takeAction(a, space)); }
  function choose(s: GameSession, a: number, value: string, payload?: Parameters<GameSession['resolveChoice']>[2]) { traces.push({ command: 'resolveChoice', actor: a, value, payload }); return ok(s.resolveChoice(a, value, payload)); }
  function select(s: GameSession, a: number, payload: Parameters<GameSession['commitSelectionChoice']>[1]) { traces.push({ command: 'commitSelectionChoice', actor: a, payload }); return ok(s.commitSelectionChoice(a, payload)); }
  function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && 'options' in r.interaction.request ? r.interaction.request.options ?? [] : []; }
  function finish(s: GameSession, first: SessionResponse, accept = true, markers: string[] = [], forbidden?: string) {
      let r = ok(first);
      for (let n = 0; n < 120 && r.interaction.stateId === 'wait'; n++) {
          if (forbidden)
              assert.equal(JSON.stringify(r.interaction).includes(forbidden), false, JSON.stringify(r.interaction));
          
          if (pause?.(r))
              return r;
          r = passPreparationExchanges(s, r);
          const i = r.interaction;
          if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player')
              return ok(r);
          const q = i.request;
          if (q.kind === 'confirm-player-switch')
              r = choose(s, q.fromPlayerIndex, 'confirm');
          else if (q.kind === 'choice' || q.kind === 'select-trigger') {
              const active = q.options.filter(o => !('disabled' in o && o.disabled)), preferred = markers.flatMap(m => active.filter(o => JSON.stringify(o).includes(m))).find(o => !['__pass__', '__skip__', '__done__'].includes(o.value));
              const picked = (markers.includes('skipOvenBake') && ['Major_ClayOven', 'Major_StoneOven'].includes(i.sourceCard ?? '') && i.promptKey === 'ui.interactionOptionalAction' ? active.find(o => o.value === '__skip__') : undefined) ?? (accept ? preferred ?? active.find(o => !['__pass__', '__skip__', '__done__'].includes(o.value) && o.labelKey !== 'actions.exchange.name') : undefined) ?? active.find(o => ['__pass__', '__skip__', '__done__'].includes(o.value)) ?? active[0];
              assert.ok(picked, JSON.stringify(i));
              r = choose(s, i.playerIndex, picked.value);
          }
          else if (q.kind === 'farm-select' && q.farm.farmType === 'plow')
              r = select(s, i.playerIndex, { tile: q.farm.selectableTiles[0]! });
          else if (q.kind === 'selection' && q.selection.kind === 'farm-position')
              r = select(s, i.playerIndex, { positions: [q.selection.selectablePositions[0]!] });
          else if (q.kind === 'animal-reorg')
              r = choose(s, i.playerIndex, 'confirm', { zones: q.zones });
          else if (q.kind === 'feed')
              r = choose(s, i.playerIndex, 'confirm', { selections: [] });
          else
              assert.fail(JSON.stringify(i));
      }
      assert.notEqual(r.interaction.stateId, 'wait');
      return ok(r);
  }
  function ready(s: GameSession, accept = true, markers: string[] = [], forbidden?: string) {
      let r = s.getState();
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
          traces.push({ command: 'resolveChoice', actor: r.interaction.request.nextPlayerIndex, value: 'confirm' });
          r = confirmNext(s, r);
      }
      return finish(s, r, accept, markers, forbidden);
  }
  function fill(s: GameSession, accept = true, markers: string[] = [], forbidden?: string) {
      const r = ready(s, accept, markers, forbidden);
      if (r.state.gameOver || r.interaction.stateId === 'wait')
          return r;
      const a = r.state.currentPlayerIndex, av = s.getActionAvailability(a), space = ['clay-pit', 'reed-bank', 'forest', 'fishing', 'grain-seeds', 'day-laborer'].find(id => av[id]);
      assert.ok(space, JSON.stringify(av));
      return finish(s, take(s, a, space), accept, markers, forbidden);
  }
  function reach(s: GameSession, target: number, accept = true, markers: string[] = [], forbidden?: string) {
      for (let n = 0; n < 120; n++) {
          const r = ready(s, accept, markers, forbidden);
          if (r.state.round === target || r.state.gameOver || r.interaction.stateId === 'wait')
              return r;
          assert.ok(r.state.round < target);
          fill(s, accept, markers, forbidden);
      }
      assert.fail('Natural phase not reached');
  }
  function end(s: GameSession, accept = true, markers: string[] = [], forbidden?: string) { return reach(s, s.state.round + 1, accept, markers, forbidden); }
  function minor(s: GameSession, a = 0) {
      let r = take(s, a, 'meeting-place');
      for (let n = 0; n < 10; n++) {
          assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction));
          if (opts(r).some(o => o.value === 'B004_WoodPile' || o.value === 'A006_StorageBarn' || o.value.startsWith('Major_')))
              return r;
          const o = opts(r).find(o => o.value.startsWith('action-improvement-'));
          assert.ok(o);
          r = choose(s, a, o.value);
      }
      assert.fail('Minor menu not reached');
  }
  function purchase(s: GameSession, id: string, markers: string[] = []) { const p = minor(s), o = opts(p).find(o => o.value === id || o.value === `minor:${id}`); assert.ok(o, JSON.stringify(p.interaction)); return finish(s, choose(s, 0, o.value), true, markers); }
  function resource(r: SessionResponse, expected: Partial<Resource>, p = 0) {
      for (const [k, v] of Object.entries(expected))
          assert.equal(Object.entries(r.state.players[p]!.resources).find(([key]) => key === k)?.[1], v, k);
  }
  function ownMajor(st: GameState, id: string, a = 0) { assert.ok(st.availableMajorImprovements.includes(id), `Unavailable fixture major ${id}`); st.players[a]!.improvements.push(id); st.availableMajorImprovements = st.availableMajorImprovements.filter(x => x !== id); }
  function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
  function anytime(s: GameSession, id: string) { traces.push({ command: 'takeAnytimeAction', actor: 0, id }); return ok(s.takeAnytimeAction(0, id)); }
  function harvest(s: GameSession, accept = true, forbidden?: string) { pause = r => r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed' && r.interaction.playerIndex === 0; const r = end(s, accept, [], forbidden); pause = undefined; assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed', JSON.stringify(r.interaction)); return r; }
  function catalog(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed'); return r.interaction.request.exchangeCatalog ?? []; }
  function feed(s: GameSession, rows: {
      sourceId: string;
      exchangeIndex: number;
      count: number;
  }[]) { return finish(s, choose(s, 0, 'confirm', { selections: rows })); }
  function row(e: ReturnType<typeof catalog>[number], count = 1) { return { sourceId: e.sourceId, exchangeIndex: e.exchangeIndex, count }; }
  function cook(s: GameSession) { const r = anytime(s, 'exchange'); assert.ok(r.interaction.stateId === 'wait'); return r; }
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); pause = undefined; });
  it("C062 N1 real purchase and harvest vegetable exchange double each cookery once", () => { const s = make('C062_CookeryExtension', st => { ownMajor(st, 'Major_Fireplace1'); ownMajor(st, 'Major_Fireplace2'); Object.assign(st.players[0]!.resources, { clay: 2, vegetable: 2 }); }, false, 4), b = purchase(s, 'C062_CookeryExtension'), p = harvest(s), es = catalog(p).filter(e => e.sourceId.startsWith('C062_CookeryExtension::') && e.from.vegetable === 1); assert.equal(es.length, 2); assert.ok(es.every(e => e.to.food === 4 && e.max === 1)); const r = feed(s, es.map(e => row(e))); resource(r, { food: 104, vegetable: 0, begging: 0 }); save('C062-N1', { b, p, r }); });
  it("C062 N2 one cookery cannot double two recipes while legal single retry feeds the family", () => { const s = make('C062_CookeryExtension', st => { ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.vegetable = 2; }, true, 4), p = harvest(s), e = catalog(p).find(e => e.sourceId === 'C062_CookeryExtension::Major_Fireplace1' && e.from.vegetable === 1); assert.ok(e); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { selections: [row(e), row(e)] })), r = feed(s, [row(e)]); resource(r, { food: 100, vegetable: 1, begging: 0 }); assert.deepEqual(r.state.players[0]!.cardStates.C062_CookeryExtension?.extraData?.usedCookeryIds, ['Major_Fireplace1']); save('C062-N2', { p, bad, r }); });
  it("C062 N3 held card no cookery grain and nonharvest windows exclude doubled recipes", () => { for (const mode of ['hand', 'cookery', 'grain']) {
      const s = make('C062_CookeryExtension', st => { if (mode !== 'cookery')
          ownMajor(st, 'Major_Fireplace1'); Object.assign(st.players[0]!.resources, { food: 0, vegetable: mode === 'grain' ? 0 : 1, grain: mode === 'grain' ? 1 : 0 }); }, mode !== 'hand', 4), p = harvest(s);
      assert.equal(catalog(p).some(e => e.sourceId.startsWith('C062_CookeryExtension') && (mode !== 'grain' || e.from.grain)), false);
      const r = feed(s, []);
      resource(r, { food: 0, begging: 4 });
      save(`C062-N3-${mode}`, { p, r });
  } const s = make('C062_CookeryExtension', st => { ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.vegetable = 1; }), p = cook(s); assert.equal(JSON.stringify(p.interaction).includes('C062_CookeryExtension::'), false); save('C062-N3-nonharvest', p); });
})
