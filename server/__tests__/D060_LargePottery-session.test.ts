import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import { afterEach, it, describe } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from './_helpers/negative-rule-audit'

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
  function final(s: GameSession) {
      for (let n = 0; n < 25; n++) {
          if (s.state.gameOver)
              return ok(s.getState());
          fill(s);
      }
      assert.fail('Actual final not reached');
  }
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
  function bonus(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
  function points(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cards')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
  function ownMajor(st: GameState, id: string, a = 0) { assert.ok(st.availableMajorImprovements.includes(id), `Unavailable fixture major ${id}`); st.players[a]!.improvements.push(id); st.availableMajorImprovements = st.availableMajorImprovements.filter(x => x !== id); }
  function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
  function anytime(s: GameSession, id: string) { traces.push({ command: 'takeAnytimeAction', actor: 0, id }); return ok(s.takeAnytimeAction(0, id)); }
  function cook(s: GameSession) { const r = anytime(s, 'exchange'); assert.ok(r.interaction.stateId === 'wait'); return r; }
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); pause = undefined; });
  it("D060 N1 real Pottery return purchase and unlimited clay exchange grant two food per clay", () => { const s = make('D060_LargePottery', st => { ownMajor(st, 'Major_Pottery'); Object.assign(st.players[0]!.resources, { clay: 3, stone: 1 }); }, false), b = purchase(s, 'D060_LargePottery'); resource(b, { clay: 2, stone: 0 }); assert.ok(b.state.availableMajorImprovements.includes('Major_Pottery')); end(s); const p = cook(s), o = opts(p).find(o => o.sourceCard === 'D060_LargePottery'); assert.ok(o); const r = finish(s, choose(s, 0, `bulk:${o.value.split(':')[1]}=2`)); resource(r, { food: 104, clay: 0 }); save('D060-N1', { b, p, r }); });
  it("D060 N2 missing Pottery missing material held card and excessive amount cannot give extra food", () => { for (const mode of ['pottery', 'clay', 'stone']) {
      const s = make('D060_LargePottery', st => { if (mode !== 'pottery')
          ownMajor(st, 'Major_Pottery'); Object.assign(st.players[0]!.resources, { clay: mode === 'clay' ? 0 : 1, stone: mode === 'stone' ? 0 : 1 }); }, false);
      save(`D060-N2-${mode}`, rejectBuy(s, 'D060_LargePottery'));
  } const h = make('D060_LargePottery', st => { st.players[0]!.resources.clay = 1; }, false); assert.equal(h.getState().interaction.anytimeActions.some(x => x.id === 'exchange'), false); save('D060-N2-hand', h.getState()); const s = make('D060_LargePottery', st => { st.players[0]!.resources.clay = 1; }), p = cook(s), o = opts(p).find(o => o.sourceCard === 'D060_LargePottery'); assert.ok(o); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'bulk:999999=1')), r = finish(s, choose(s, 0, `bulk:${o.value.split(':')[1]}=2`)); resource(r, { clay: 0, food: 102 }); save('D060-N2-overdraw', { p, bad, r }); });
  it("D060 N3 actual final scoring uses remaining clay threshold and printed three points", () => { for (const [clay, expected] of [[2, 0], [3, 1], [4, 1], [5, 2], [6, 3], [7, 4], [8, 4]]) {
      const s = make('D060_LargePottery', st => { ownMajor(st, 'Major_Pottery'); Object.assign(st.players[0]!.resources, { clay: clay! + 1, stone: 1 }); }, false, 14), b = purchase(s, 'D060_LargePottery'), r = final(s);
      assert.equal(points(r, 'D060_LargePottery'), 3);
      assert.equal(bonus(r, 'D060_LargePottery'), expected);
      save(`D060-N3-${clay}`, { b, r });
  } });
})
