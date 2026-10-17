import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D062_BeerTap'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from './_helpers/negative-rule-audit'

const CARD_ID = 'D062_BeerTap'
const FILLER = '__test_placeholder__'

const setupPurchase = () => {
  const session = new GameSession(6062, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID]
  owner.resources.wood = 1
  owner.resources.food = 0
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const setupHarvest = (grain: number) => {
  const session = new GameSession(6200 + grain, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorPlayed = [CARD_ID]
  owner.resources.grain = grain
  session.loadState(state)
  return session
}

const enterFeed = (session: GameSession) => {
  let response = session.performRoundEnd()
  for (let guard = 0; guard < 10 && response.interaction.stateId === 'wait'
    && response.interaction.request.kind !== 'feed'; guard += 1) {
    const skip = response.interaction.request.options?.find((option) =>
      option.value === '__skip__' || option.value === '__done__')
    expect(skip, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, skip!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected feeding interaction')
  expect(response.interaction.request.kind).toBe('feed')
  return response
}

const selection = (exchangeIndex: number, count = 1) => ({
  sourceId: CARD_ID, exchangeIndex, count, sourceName: 'Beer Tap',
})

describe('D062 Beer Tap parity', () => {
  it('D062 S1: paying one wood plays Beer Tap and immediately gains two food', () => {
    const response = playMinor(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 2 })
  })

  for (const [scenario, grain, food, exchangeIndex] of [
    ['S2', 2, 3, 0],
    ['S3', 3, 6, 1],
    ['S4', 4, 9, 2],
  ] as const) {
    it(`D062 ${scenario}: ${grain} grain become ${food} food during feeding`, () => {
      const session = setupHarvest(grain)
      enterFeed(session)

      const response = session.resolveChoice(0, 'confirm', {
        selections: [selection(exchangeIndex)],
      })

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 16 + food })
    })
  }

  it('D062 S5: the feeding exchange may be declined', () => {
    const session = setupHarvest(4)
    enterFeed(session)

    const response = session.resolveChoice(0, 'confirm', { selections: [] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 4, food: 16 })
  })

  it('D062 S6: the two-grain exchange can be used twice in one feeding phase', () => {
    const session = setupHarvest(4)
    enterFeed(session)

    const response = session.resolveChoice(0, 'confirm', { selections: [selection(0, 2)] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 22 })
  })

  it('D062 S7: two different Beer Tap tiers can be combined in one feeding phase', () => {
    const session = setupHarvest(5)
    enterFeed(session)

    const response = session.resolveChoice(0, 'confirm', {
      selections: [selection(0), selection(1)],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 25 })
  })
  it('rejects a batch exceeding available grain without any partial exchange or feeding', () => {
    const session = setupHarvest(3)
    const pending = enterFeed(session)
    const response = session.resolveChoice(0, 'confirm', { selections: [selection(0, 2)] })
    expect(response.ok).toBe(false)
    expect(response.state).toEqual(pending.state)
    expect(response.interaction).toEqual(pending.interaction)
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
  function rejectBuy(s: GameSession, id: string) { const p = minor(s); assert.equal(opts(p).some(o => (o.value === id || o.value === `minor:${id}`) && !('disabled' in o && o.disabled)), false); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, id)), r = finish(s, choose(s, 0, 'B004_WoodPile')); assert.ok(r.state.players[0]!.minorHand.includes(id)); return { p, bad, r }; }
  function resource(r: SessionResponse, expected: Partial<Resource>, p = 0) {
      for (const [k, v] of Object.entries(expected))
          assert.equal(Object.entries(r.state.players[p]!.resources).find(([key]) => key === k)?.[1], v, k);
  }
  function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
  function harvest(s: GameSession, accept = true, forbidden?: string) { pause = r => r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed' && r.interaction.playerIndex === 0; const r = end(s, accept, [], forbidden); pause = undefined; assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed', JSON.stringify(r.interaction)); return r; }
  function catalog(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed'); return r.interaction.request.exchangeCatalog ?? []; }
  function feed(s: GameSession, rows: {
      sourceId: string;
      exchangeIndex: number;
      count: number;
  }[]) { return finish(s, choose(s, 0, 'confirm', { selections: rows })); }
  function row(e: ReturnType<typeof catalog>[number], count = 1) { return { sourceId: e.sourceId, exchangeIndex: e.exchangeIndex, count }; }
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); pause = undefined; });
  it("D062 N1 real purchase grants two food and actual harvest recipes consume two three or four grains", () => { for (const [grain, gain] of [[2, 3], [3, 6], [4, 9]]) {
      const s = make('D062_BeerTap', st => Object.assign(st.players[0]!.resources, { wood: 1, grain }), false, 4), b = purchase(s, 'D062_BeerTap');
      resource(b, { food: 102, wood: 0 });
      const p = harvest(s), e = catalog(p).find(e => e.sourceId === 'D062_BeerTap' && e.from.grain === grain);
      assert.ok(e);
      assert.equal(e.to.food, gain);
      const r = feed(s, [row(e)]);
      resource(r, { food: 98 + gain!, grain: 0 });
      save(`D062-N1-${grain}`, { b, p, r });
  } });
  it("D062 N2 insufficient grain invalid recipe units and held or nonharvest card cannot supply Beer Tap food", () => { const s = make('D062_BeerTap', st => { st.players[0]!.resources.grain = 1; }, true, 4), p = harvest(s), e = catalog(p).find(e => e.sourceId === 'D062_BeerTap' && e.from.grain === 2); assert.ok(e); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { selections: [row(e)] })), r = feed(s, []); resource(r, { food: 96, grain: 1 }); save('D062-N2-grain', { p, bad, r }); const h = make('D062_BeerTap', st => Object.assign(st.players[0]!.resources, { grain: 4, food: 0 }), false, 4), hp = harvest(h); assert.equal(catalog(hp).some(e => e.sourceId === 'D062_BeerTap'), false); save('D062-N2-hand', { p: hp, r: feed(h, []) }); const n = make('D062_BeerTap', st => { st.players[0]!.resources.grain = 4; }); assert.equal(n.getState().interaction.anytimeActions.some(a => a.id === 'exchange'), false); save('D062-N2-nonharvest', n.getState()); });
  it("D062 N3 genuine decline and repeated recipe batches retain exact normal feeding cost", () => { const s = make('D062_BeerTap', st => { st.players[0]!.resources.grain = 6; }, true, 4), p = harvest(s), e = catalog(p).find(e => e.sourceId === 'D062_BeerTap' && e.from.grain === 3); assert.ok(e); const r = feed(s, [row(e, 2)]); resource(r, { food: 108, grain: 0 }); save('D062-N3-batch', { p, r }); const t = make('D062_BeerTap', st => { st.players[0]!.resources.grain = 4; }, true, 4), tp = harvest(t), declined = feed(t, []); resource(declined, { food: 96, grain: 4 }); save('D062-N3-decline', { tp, declined }); save('D062-N3-cost', rejectBuy(make('D062_BeerTap', undefined, false), 'D062_BeerTap')); });
})
