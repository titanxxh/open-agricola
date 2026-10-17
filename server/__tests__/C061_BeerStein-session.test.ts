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
  function resource(r: SessionResponse, expected: Partial<Resource>, p = 0) {
      for (const [k, v] of Object.entries(expected))
          assert.equal(Object.entries(r.state.players[p]!.resources).find(([key]) => key === k)?.[1], v, k);
  }
  function bonus(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
  function ownMajor(st: GameState, id: string, a = 0) { assert.ok(st.availableMajorImprovements.includes(id), `Unavailable fixture major ${id}`); st.players[a]!.improvements.push(id); st.availableMajorImprovements = st.availableMajorImprovements.filter(x => x !== id); }
  function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
  function bakeMenu(s: GameSession, a = 0) { pause = r => r.interaction.stateId === 'wait' && (['ui.interactionBakeBreadChoice', 'ui.interactionBakeBreadCount'].includes(r.interaction.promptKey ?? '') || (r.interaction.sourceCard === 'C061_BeerStein' && r.interaction.promptKey === 'ui.interactionOptionalAction')); const r = finish(s, take(s, a, 'grain-utilization'), true, ['skipOvenBake']); pause = undefined; return r; }
  function bake(s: GameSession, provider = 'Major_Fireplace1', n = 1, a = 0, accept = true, forbidden?: string) { const p = bakeMenu(s, a); if (forbidden)
      assert.equal(JSON.stringify(p.interaction).includes(forbidden), false); if (p.interaction.stateId === 'wait' && ['ui.interactionBakeBreadChoice', 'ui.interactionBakeBreadCount'].includes(p.interaction.promptKey ?? ''))
      return finish(s, choose(s, a, `bulk:${provider}=${n}`), accept, [], forbidden); assert.equal(n, 1, 'automatic single-grain bake only'); return finish(s, p, accept, [], forbidden); }
  function currentBonus(r: SessionResponse, id: string) { return r.state.players[0]!.cardStates[id]?.counters?.bonusVp ?? 0; }
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); pause = undefined; });
  it("C061 N1 real purchase and a normal bake pay one extra grain for two food and one bonus point", () => { const s = make('C061_BeerStein', st => { ownMajor(st, 'Major_Fireplace1'); Object.assign(st.players[0]!.resources, { clay: 1, grain: 3 }); }, false), b = purchase(s, 'C061_BeerStein'); resource(b, { clay: 0 }); fill(s); ready(s); const r = bake(s); resource(r, { grain: 1, food: 104 }); assert.equal(currentBonus(r, 'C061_BeerStein'), 1); save('C061-N1', { b, r }); });
  it("C061 N2 held card foreign bake missing extra grain and real decline exclude Stein exchange", () => { for (const mode of ['hand', 'opponent', 'grain', 'decline']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('C061_BeerStein', st => { st.currentPlayerIndex = a; ownMajor(st, a ? 'Major_Fireplace2' : 'Major_Fireplace1', a); st.players[a]!.resources.grain = mode === 'grain' ? 1 : 2;if(a===1)st.players[0]!.resources.grain=2; }, mode !== 'hand'), r = bake(s, a ? 'Major_Fireplace2' : 'Major_Fireplace1', 1, a, mode !== 'decline', ['hand', 'opponent'].includes(mode) ? 'C061_BeerStein' : undefined);
      resource(r, { food: 102, grain: mode === 'grain' ? 0 : 1 }, a);
      assert.equal(currentBonus(r, 'C061_BeerStein'), 0);if(a===1)resource(r,{food:100,grain:2});
      save(`C061-N2-${mode}`, r);
  } const zero=make('C061_BeerStein',st=>ownMajor(st,'Major_Fireplace1'));assert.equal(zero.getActionAvailability(0)['grain-utilization'],false);const denied=assertRejectedUnchanged(zero,()=>zero.takeAction(0,'grain-utilization')),seeded=finish(zero,take(zero,0,'grain-seeds'));fill(zero);ready(zero);const legal=bake(zero);resource(legal,{food:102,grain:0});assert.equal(currentBonus(legal,'C061_BeerStein'),0);save('C061-N2-normal-grain',{denied,seeded,legal});});
  it("C061 N3 one exchange per bake action and repeated real rounds retain bonus scoring", () => { const s = make('C061_BeerStein', st => { ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.grain = 5; }), first = bake(s, 'Major_Fireplace1', 2); resource(first, { grain: 2, food: 106 }); assert.equal(currentBonus(first, 'C061_BeerStein'), 1); const six = end(s), second = bake(s); resource(second, { grain: 0, food: 110 }); assert.equal(currentBonus(second, 'C061_BeerStein'), 2); save('C061-N3-repeat', { first, six, second }); const t = make('C061_BeerStein', st => { ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.grain = 2; }, true, 14), b = bake(t), r = final(t); assert.equal(bonus(r, 'C061_BeerStein'), 1); save('C061-N3-score', { b, r }); });
})
