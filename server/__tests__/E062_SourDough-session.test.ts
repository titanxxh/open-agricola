import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E062_SourDough'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from './_helpers/negative-rule-audit'

const CARD_ID = 'E062_SourDough'
const ANYTIME_ID = 'E62-sour-dough-anytime'
const FIREPLACE = 'Major_Fireplace1'
const CLAY_OVEN = 'Major_ClayOven'

const setup = () => {
  const session = new GameSession(62062, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 1)
    setWorkersAtHome(state, player, 1)
  })
  const owner = state.players[0]!
  owner.minorPlayed = [CARD_ID]
  owner.improvements = [FIREPLACE, CLAY_OVEN]
  owner.resources.grain = 1
  owner.resources.food = 0
  session.loadState(state)
  return session
}

const offered = (response: SessionResponse) =>
  response.interaction.anytimeActions.some((entry) => entry.id === ANYTIME_ID)

const startReplacement = (session: GameSession) => {
  const response = session.takeAnytimeAction(0, ANYTIME_ID)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    playerIndex: 0,
    promptKey: 'ui.interactionBakeBreadChoice',
  })
  return response
}

const completeReplacement = (session: GameSession) => {
  startReplacement(session)
  return session.resolveChoice(0, FIREPLACE)
}

describe('E062 Sour Dough turn replacement', () => {
  it('is offered while idle and replaces the turn without placing a worker', () => {
    const session = setup()
    const before = session.getState()
    expect(before.interaction.stateId).toBe('idle')
    expect(offered(before)).toBe(true)
    expect(workersAvailable(before.state, before.state.players[0]!)).toBe(1)

    const response = completeReplacement(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.state.actionSpaces.every((space) =>
      space.takenBy.every((worker) => worker.playerId !== 'p1'),
    )).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
    })
  })

  it('keeps the normal placement turn when the offered replacement is not selected', () => {
    const session = setup()
    expect(offered(session.getState())).toBe(true)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual(expect.objectContaining({ playerId: 'p1' }))
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })

  it('does not offer a second replacement in the same round', () => {
    const session = setup()
    const completed = completeReplacement(session)
    expect(completed.interaction.stateId).toBe('wait')
    session.resolveChoice(1, 'confirm')

    session.takeAction(1, 'forest')
    const backToOwner = session.resolveChoice(0, 'confirm')

    expect(backToOwner.state.currentPlayerIndex).toBe(0)
    expect(offered(backToOwner)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
  })

  it('is unavailable when another player has no person left to place', () => {
    const session = setup()
    const state = session.getState().state
    setWorkersAtHome(state, state.players[1]!, 0)
    session.loadState(state)

    expect(offered(session.getState())).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
  })

  it('cannot be inserted into an action or nested interaction', () => {
    const session = setup()
    const response = session.takeAction(0, 'farmland')

    expect(response.interaction.stateId).toBe('wait')
    expect(offered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
  })

  it('undo restores the replacement opportunity and unspent resources', () => {
    const session = setup()
    completeReplacement(session)

    const undone = session.undoAction()

    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.currentPlayerIndex).toBe(0)
    expect(undone.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(undone.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(workersAvailable(undone.state, undone.state.players[0]!)).toBe(1)
    expect(offered(undone)).toBe(true)
  })

  it('keeps replacement identity and turn rotation across snapshot restore', () => {
    const session = setup()
    const pending = startReplacement(session)
    const restored = new GameSession(JSON.parse(JSON.stringify({
      state: pending.state,
      sessionCursor: session.createSessionPrivateCursor(),
    })))

    const response = restored.resolveChoice(0, FIREPLACE)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
    })
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
  function undo(s: GameSession) { traces.push({ command: 'undoAction' }); return ok(s.undoAction()); }
  function resource(r: SessionResponse, expected: Partial<Resource>, p = 0) {
      for (const [k, v] of Object.entries(expected))
          assert.equal(Object.entries(r.state.players[p]!.resources).find(([key]) => key === k)?.[1], v, k);
  }
  function points(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cards')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
  function occupied(r: SessionResponse, a = 0) { return r.state.actionSpaces.flatMap(x => x.takenBy).filter(x => x.playerId === r.state.players[a]!.id); }
  function ownMajor(st: GameState, id: string, a = 0) { assert.ok(st.availableMajorImprovements.includes(id), `Unavailable fixture major ${id}`); st.players[a]!.improvements.push(id); st.availableMajorImprovements = st.availableMajorImprovements.filter(x => x !== id); }
  function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
  function anytime(s: GameSession, id: string) { traces.push({ command: 'takeAnytimeAction', actor: 0, id }); return ok(s.takeAnytimeAction(0, id)); }
  function forbiddenAny(s: GameSession, id: string) { const r = s.getState(); assert.equal(r.interaction.anytimeActions.some(x => x.id === id), false); traces.push({command:'takeAnytimeAction',actor:r.state.currentPlayerIndex,id});const bad = assertRejectedUnchanged(s, () => s.takeAnytimeAction(r.state.currentPlayerIndex, id)); return { r, bad }; }
  function replacement(s: GameSession) { const p = anytime(s, 'E62-sour-dough-anytime'); assert.ok(p.interaction.stateId === 'wait'); assert.ok(['ui.interactionBakeBreadChoice', 'ui.interactionBakeBreadCount'].includes(p.interaction.promptKey ?? '')); return finish(s, choose(s, 0, 'bulk:Major_Fireplace1=1')); }
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); pause = undefined; });
  it("E062 N1 real gated purchase then next-round replacement bakes without consuming a farmer", () => { const s = make('E062_SourDough', st => { occupations(st.players[0]!, 3); ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.grain = 2; }, false), b = purchase(s, 'E062_SourDough'), six = end(s), r = replacement(s); resource(r, { food: 102, grain: 1 }); assert.equal(occupied(r).length, 0); assert.equal(r.state.players[0]!.workers.filter(w => w.isActive && !w.isNewborn).length, 2); ready(s); fill(s); ready(s); const bad = forbiddenAny(s, 'E62-sour-dough-anytime'); save('E062-N1', { b, six, r, bad }); });
  it("E062 N2 missing occupations or baking improvement held card and exhausted opponent exclude replacement", () => { for (const mode of ['occupation', 'baking']) {
      const s = make('E062_SourDough', st => { occupations(st.players[0]!, mode === 'occupation' ? 2 : 3); if (mode !== 'baking')
          ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.grain = 1; }, false);
      save(`E062-N2-${mode}`, rejectBuy(s, 'E062_SourDough'));
  } const h = make('E062_SourDough', st => { occupations(st.players[0]!, 3); ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.grain = 1; }, false); save('E062-N2-hand', forbiddenAny(h, 'E62-sour-dough-anytime')); const s = make('E062_SourDough', st => { ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.grain = 2; }), r = replacement(s); ready(s); finish(s, take(s, 1, 'clay-pit')); ready(s); finish(s, take(s, 0, 'reed-bank')); ready(s); finish(s, take(s, 1, 'forest')); ready(s); const bad = forbiddenAny(s, 'E62-sour-dough-anytime'), control = finish(s, take(s, 0, 'grain-seeds')); save('E062-N2-exhausted', { r, bad, control }); });
  it("E062 N3 replacement undo or restart boundary natural reset and printed final point preserve turn semantics", () => { const s = make('E062_SourDough', st => { ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.grain = 3; }), r = replacement(s), u = undo(s); resource(u, { grain: 3, food: 100 }); assert.equal(occupied(u).length, 0); const replay = replacement(s); for (const [a, space] of [[1, 'clay-pit'], [0, 'reed-bank'], [1, 'forest'], [0, 'farmland']] satisfies [
      number,
      string
  ][]) {
      ready(s);
      finish(s, take(s, a, space));
  } const six = end(s), second = replacement(s); resource(second, { grain: 1, food: 104 }); save('E062-N3-replay', { r, u, replay, six, second }); const t = make('E062_SourDough', st => ownMajor(st, 'Major_Fireplace1'), true, 14), done = final(t); assert.equal(points(done, 'E062_SourDough'), 1); save('E062-N3-score', done); });
})
