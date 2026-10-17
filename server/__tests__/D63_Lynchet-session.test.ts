import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { reap } from '../../shared/actions/effects/reap'

import '../../shared/cards/D/D063_Lynchet'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext, passPreparationExchanges } from './_helpers/negative-rule-audit'

const CARD_ID = 'D063_Lynchet'

describe('D063_Lynchet session', () => {
  it('onAfterReap counts only adjacent harvested positions', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]

    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 1, vegetable: 1 },
        grainFields: 1,
        vegetableFields: 1,
        harvestedPositions: [
          { row: 1, col: 0 }, // adjacent to (0,0)
          { row: 1, col: 1 }, // adjacent to (0,1)
        ],
      },
    }
    session.loadState(state)

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).not.toBeNull()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(2)
  })

  it('counts only positions that are orthogonally adjacent to a room tile', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }]

    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 2 },
        grainFields: 2,
        vegetableFields: 0,
        harvestedPositions: [
          { row: 1, col: 0 }, // adjacent
          { row: 2, col: 2 }, // not adjacent
        ],
      },
    }
    session.loadState(state)

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).not.toBeNull()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('end-to-end: reap with mixed fields populates harvestedPositions and listener counts adjacents', () => {
    // The reference fix scenario: 3 grain fields, only 2 of them adjacent to rooms.
    // Old summary-only counting could not distinguish which fields were
    // harvested when there are multiple grain fields with different
    // adjacencies. The new harvestedPositions field makes it precise.
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }]

    player.fields = [
      // adjacent (1,0); will produce 1 grain
      { row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      // not adjacent (2,2); will produce 1 grain
      { row: 2, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
      // empty field; not harvested
      { row: 3, col: 0, stacks: [] },
    ]

    const result = session.withCtx(() => reap(state, player))
    expect(result.type).toBe('ok')
    expect(result.reapSummary.harvestedPositions).toEqual([
      { row: 1, col: 0 },
      { row: 2, col: 2 },
    ])

    state.harvestReapSummary = { [player.id]: result.reapSummary }
    session.loadState(state)

    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).not.toBeNull()
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.food).toBe(1)
  })

  it('does not trigger when no fields were harvested', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }]
    state.harvestReapSummary = {
      [player.id]: { resources: {}, grainFields: 0, vegetableFields: 0, harvestedPositions: [] },
    }
    session.loadState(state)
    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeNull()
  })

  it('does not trigger when no harvested positions are adjacent to rooms', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.roomTiles = [{ row: 0, col: 0 }]
    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 1 },
        grainFields: 1,
        vegetableFields: 0,
        harvestedPositions: [{ row: 2, col: 2 }],
      },
    }
    session.loadState(state)
    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeNull()
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
  function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
  function fields(p: PlayerState, specs: [
      number,
      number,
      'grain' | 'vegetable',
      number
  ][]) { p.fields = specs.map(([row, col, kind, remaining]) => ({ row, col, stacks: remaining ? [{ kind, remaining }] : [] })); }
  function catalog(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed'); return r.interaction.request.exchangeCatalog ?? []; }
  function row(e: ReturnType<typeof catalog>[number], count = 1) { return { sourceId: e.sourceId, exchangeIndex: e.exchangeIndex, count }; }
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); pause = undefined; });
  it("D063 N1 real purchase and actual reap count only orthogonally adjacent harvested tiles", () => { const s = make('D063_Lynchet', st => fields(st.players[0]!, [[0, 0, 'grain', 3], [0, 1, 'vegetable', 2], [1, 1, 'grain', 1]]), false, 7), b = purchase(s, 'D063_Lynchet'), r = end(s); resource(r, { food: 98, grain: 2, vegetable: 1 }); save('D063-N1', { b, r }); });
  it("D063 N2 empty adjacent field diagonal harvested field held card and nonharvest exclude Lynchet food", () => { for (const mode of ['diagonal', 'hand', 'nonharvest']) {
      const s = make('D063_Lynchet', st => fields(st.players[0]!, [[0, 0, 'grain', mode === 'diagonal' ? 0 : 1], [0, 1, 'grain', 3]]), mode !== 'hand', mode === 'nonharvest' ? 5 : 7), r = end(s, true, [], mode === 'hand' ? 'D063_Lynchet' : undefined);
      resource(r, { food: mode === 'nonharvest' ? 100 : 96 });
      save(`D063-N2-${mode}`, r);
  } });
  it("D063 N3 multiple crops on a tile pay once and subsequent empty harvest pays nothing", () => { const s = make('D063_Lynchet', st => fields(st.players[0]!, [[0, 0, 'grain', 3], [0, 1, 'grain', 0]]), true, 7), first = end(s), later = reach(s, 10), last = reach(s, 12), empty = reach(s, 14); resource(first, { food: 97, grain: 1 }); resource(later, { food: 94, grain: 2 }); resource(last, { food: 91, grain: 3 }); resource(empty, { food: 87, grain: 3 }); assert.ok(empty.state.players[0]!.fields.every(f => !f.stacks.length)); save('D063-N3', { first, later, last, empty }); });
})
