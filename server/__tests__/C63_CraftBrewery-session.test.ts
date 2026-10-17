import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'
import { runSelectionEffect } from '../../shared/actions/helpers/selection-effect-registry'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C063_CraftBrewery'
import '../../shared/cards/B/B113_PatchCaregiver'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from './_helpers/negative-rule-audit'

describe('C063_CraftBrewery session (verify-only)', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players.forEach((candidate) => {
      candidate.minorHand = ['__test_placeholder__']
      candidate.occupationHand = ['__test_placeholder__']
    })
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.minorPlayed.push('C063_CraftBrewery')
    player.fields = []
    return { session, state, player }
  }

  it('returns optional seq with field selection + pay/gain when supply has grain and one field has grain', () => {
    const { session, state, player } = setup()
    player.resources.grain = 2
    player.fields.push({
      stacks: [{ kind: 'grain', remaining: 1 }],
      row: 1,
      col: 0,
    })
    session.loadState(state)

    const flow = session.withCtx(() => runCardEffectHook(
      state,
      player,
      'C063_CraftBrewery',
      'onHarvestFeedingPhase',
    ))
    expect(flow).not.toBeNull()
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')
    expect(seq.optional).toBe(true)
    expect(seq.children.map((c) => (c as Extract<ActionFlow, { type: 'leaf' }>).actionId)).toEqual([
      'selection',
      'pay',
      'gain',
      'bonus-vp',
      'bonus-vp',
    ])
    const selection = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(selection.actionId).toBe('selection')
    expect(selection.sourceCard).toBe('C063_CraftBrewery')
    expect(selection.actionContext).toMatchObject({
      selectionKind: 'farm-position',
      selectableTiles: [{ row: 1, col: 0 }],
      minSelections: 1,
      maxSelections: 1,
    })
    const pay = seq.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(pay.params).toEqual({ grain: 1 })
    const gain = seq.children[2] as Extract<ActionFlow, { type: 'leaf' }>
    expect(gain.params).toEqual({ food: 4 })

    expect(player.fields[0]!.stacks[0]?.remaining).toBe(1)
  })

  it('selects grain from a Card Field through the Logical Field mutation seam', () => {
    const { session: ruleSession, state, player } = setup()
    player.resources.grain = 2
    player.occupationPlayed.push('B113_PatchCaregiver')
    player.cardStates.B113_PatchCaregiver = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] },
    }

    const flow = ruleSession.withCtx(() => runCardEffectHook(state, player, 'C063_CraftBrewery', 'onHarvestFeedingPhase'))
    const selection = flow?.type === 'seq' ? flow.children[0] : undefined
    expect(selection).toMatchObject({
      actionContext: {
        selectionKind: 'farm-position',
        selectableTiles: [expect.objectContaining({ row: -1, col: 2113 })],
        minSelections: 1,
        maxSelections: 1,
        selectionEffect: 'c63-craft-brewery-remove-grain',
      },
    })

    runSelectionEffect('c63-craft-brewery-remove-grain', {
      state,
      player,
      positions: ['-1-2113'],
      cards: [],
      sourceCard: 'C063_CraftBrewery',
    })

    expect(player.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 1 },
    ])
  })

  it('returns null when player has no grain in supply', () => {
    const { session, state, player } = setup()
    player.resources.grain = 0
    player.fields.push({
      stacks: [{ kind: 'grain', remaining: 1 }],
      row: 1,
      col: 0,
    })
    session.loadState(state)

    const flow = session.withCtx(() => runCardEffectHook(
      state,
      player,
      'C063_CraftBrewery',
      'onHarvestFeedingPhase',
    ))
    expect(flow).toBeNull()
    // Field untouched.
    expect(player.fields[0]!.stacks[0]?.remaining).toBe(1)
  })

  it('returns null when no grain field exists', () => {
    const { session, state, player } = setup()
    player.resources.grain = 2
    // Only a vegetable field — no grain anywhere.
    player.fields.push({
      stacks: [{ kind: 'vegetable', remaining: 2 }],
      row: 1,
      col: 0,
    })
    session.loadState(state)

    const flow = session.withCtx(() => runCardEffectHook(
      state,
      player,
      'C063_CraftBrewery',
      'onHarvestFeedingPhase',
    ))
    expect(flow).toBeNull()
  })

  it('settles field grain, supply grain, food, and two bonus points through harvest Session', () => {
    const session = new GameSession(7063, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    session.state.round = 4
    session.state.players.forEach((candidate) => {
      setActiveWorkerCount(candidate, 0)
      candidate.minorHand = ['__test_placeholder__']
      candidate.occupationHand = ['__test_placeholder__']
      candidate.minorPlayed = []
      candidate.occupationPlayed = []
      candidate.cardStates = {}
      candidate.fields = []
      candidate.resources.food = 0
      candidate.resources.grain = 0
    })
    const player = session.state.players[0]!
    player.minorPlayed = ['C063_CraftBrewery']
    player.resources.grain = 1
    player.fields = [{
      row: 1, col: 0, stacks: [{ kind: 'grain', remaining: 2 }],
    }]
    session.loadState(session.state)

    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', sourceCard: 'C063_CraftBrewery', request: { kind: 'selection' },
    })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'selection') return
    const position = response.interaction.request.selection.selectablePositions[0]!
    response = session.commitSelectionChoice(0, { positions: [position] })
    expect(response.interaction.stateId, JSON.stringify(response.interaction, null, 2)).toBe('idle')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]?.remaining ?? 0).toBe(0)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 4 })
    expect(response.state.players[0]!.cardStates.C063_CraftBrewery?.counters?.bonusVp).toBe(2)
    expect(response.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.paid', sourceCardId: 'C063_CraftBrewery', resources: { grain: 1 } }),
      expect.objectContaining({ type: 'resource.moved', sourceCardId: 'C063_CraftBrewery', resources: { food: 4 } }),
    ]))
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
  function bonus(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
  function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
  function fields(p: PlayerState, specs: [
      number,
      number,
      'grain' | 'vegetable',
      number
  ][]) { p.fields = specs.map(([row, col, kind, remaining]) => ({ row, col, stacks: remaining ? [{ kind, remaining }] : [] })); }
  function catalog(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'feed'); return r.interaction.request.exchangeCatalog ?? []; }
  function row(e: ReturnType<typeof catalog>[number], count = 1) { return { sourceId: e.sourceId, exchangeIndex: e.exchangeIndex, count }; }
  function currentBonus(r: SessionResponse, id: string) { return r.state.players[0]!.cardStates[id]?.counters?.bonusVp ?? 0; }
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); pause = undefined; });
  it("C063 N1 real purchase and natural harvest consume reserve and field grain for four food and two points", () => { const s = make('C063_CraftBrewery', st => { Object.assign(st.players[0]!.resources, { wood: 2, clay: 1 }); fields(st.players[0]!, [[0, 1, 'grain', 3]]); }, false, 7), b = purchase(s, 'C063_CraftBrewery'), r = end(s); resource(r, { food: 100, grain: 0 }); assert.equal(currentBonus(r, 'C063_CraftBrewery'), 2); assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 1); save('C063-N1', { b, r }); });
  it("C063 N2 empty reaped field held card vegetable field and genuine decline exclude Brewery", () => { for (const mode of ['empty', 'hand', 'vegetable', 'decline']) {
      const s = make('C063_CraftBrewery', st => fields(st.players[0]!, [[0, 1, mode === 'vegetable' ? 'vegetable' : 'grain', mode === 'empty' ? 1 : mode==='vegetable'?2:3]]), mode !== 'hand', 7), r = end(s, mode !== 'decline', [], mode === 'hand' ? 'C063_CraftBrewery' : undefined);
      resource(r, { food: 96 });
      assert.equal(currentBonus(r, 'C063_CraftBrewery'), 0);
      if (mode === 'decline') {
          resource(r, { grain: 1 });
          assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2);
      }
      save(`C063-N2-${mode}`, r);
  } });
  it("C063 N3 illegal field choice rejects before a legal grain target and final bonus scoring", () => { const s = make('C063_CraftBrewery', st => fields(st.players[0]!, [[0, 1, 'grain', 3], [0, 2, 'grain', 3]]), true, 14); pause = r => r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection'; const p = end(s); pause = undefined; assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'selection'); const bad = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 1, col: 0 }] })), r = finish(s, select(s, 0, { positions: [{ row: 0, col: 1 }] })); assert.equal(bonus(r, 'C063_CraftBrewery'), 2); resource(r, { food: 100, grain: 1 }); save('C063-N3', { p, bad, r }); });
})
