import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/A/A002_ShiftingCultivation'

import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { PaymentSolver } from '../../shared/actions/payment'
import { createWorkSession } from './_helpers/session-fixtures'
import '../../shared/cards/E/E060_WorkingGloves'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import type { GameState, PlayerState, Resource } from '../../shared/contract/types'
import { assertRejectedUnchanged, passPreparationExchanges } from './_helpers/negative-rule-audit'

const CARD_ID = 'E060_WorkingGloves'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Public cost previews cover fees not offered by an ordinary Lessons action;
// committed payment and action admission are covered by Session tests below.
describe('E060 Working Gloves cost candidates', () => {
  const setup = (food = 4) => {
    const session = createWorkSession({ configure(state) {
      const owner = state.players[0]!
      owner.minorPlayed = [CARD_ID]
      Object.assign(owner.resources, { wood: 1, clay: 1, reed: 1, stone: 1, food })
    } })
    sessions.push(session)
    return { session, state: session.getState().state }
  }

  const options = (foodFee: number, availableFood = 4) => {
    const { session, state } = setup(availableFood)
    const resolved = session.withCtx(() => PaymentSolver.resolveCardPreviewCostDetailedByProvider(
      state, state.players[0]!, 'occupation', 'A116_WoodCutter', () => ({ food: foodFee }), 'lessons', session.actionHooks,
    ))
    if (!resolved) throw new Error('Expected an occupation cost')
    const cost = PaymentSolver.isComplexCost(resolved.cost) ? resolved.cost : { fee: resolved.cost }
    const context = { actionId: 'occupation', costType: 'occupation' as const,
      candidateMetadataByFeeIndex: resolved.candidateMetadataByFeeIndex }
    return { solutions: PaymentSolver.computeOptions(state, 0, cost, context),
      previews: PaymentSolver.describeOptions(state, 0, cost, context) }
  }

  it.each([[1, 0], [2, 0], [3, 1], [4, 2]])('fee %i substitutes at most two food, leaving %i food payable', (fee, remainder) => {
    const { solutions } = options(fee)
    expect(solutions.some(solution => solution.resourcesPaid.food === fee)).toBe(true)
    for (const material of ['wood', 'clay', 'reed', 'stone'] as const) {
      expect(solutions.some(solution => solution.resourcesPaid[material] === 1 &&
        (solution.resourcesPaid.food ?? 0) === remainder)).toBe(true)
    }
  })

  it('offers a free fee without charging a material', () => {
    const { solutions } = options(0, 0)
    expect(solutions).toHaveLength(1)
    expect(Object.values(solutions[0]!.resourcesPaid).every(amount => amount === 0)).toBe(true)
  })

  it('does not substitute twice for a four-food fee', () => {
    expect(options(4, 0).solutions).toEqual([])
  })

  it('combines a single substitution with Forest School for the remaining food', () => {
    const { session, state } = setup(0)
    const owner = state.players[0]!
    owner.minorPlayed.push('A028_ForestSchool')
    Object.assign(owner.resources, { wood: 2, clay: 1 })
    // Reload derives the other card's ordinary occupation payment modifier.
    session.loadState(state)
    const live = session.getState().state
    const resolved = session.withCtx(() => PaymentSolver.resolveCardPreviewCostDetailedByProvider(live, live.players[0]!, 'occupation', 'A116_WoodCutter', () => ({ food: 4 }), undefined, session.actionHooks))
    if (!resolved) throw new Error('Expected cost candidates')
    const previews = PaymentSolver.describeOptions(live, 0, resolved.cost, {
      actionId: 'occupation', costType: 'occupation', candidateMetadataByFeeIndex: resolved.candidateMetadataByFeeIndex,
    })
    expect(previews.some(preview => preview.effectPreview?.kind === 'payment' &&
      preview.effectPreview.resourcesPaid?.clay === 1 && preview.effectPreview.resourcesPaid.wood === 2 &&
      preview.effectPreview.sourceCards?.includes(CARD_ID) && preview.effectPreview.sourceCards.includes('A028_ForestSchool'))).toBe(true)
  })

  it('attributes only material candidate previews to Working Gloves', () => {
    const { previews } = options(1)
    const paid = previews.map(preview => preview.effectPreview)
    const material = paid.find(preview => preview?.kind === 'payment' && preview.resourcesPaid?.wood === 1)
    const ordinary = paid.find(preview => preview?.kind === 'payment' && preview.resourcesPaid?.food === 1)
    expect(material).toMatchObject({ kind: 'payment', resourcesPaid: { wood: 1 }, sourceCards: [CARD_ID] })
    expect(ordinary).toMatchObject({ kind: 'payment', resourcesPaid: { food: 1 } })
    if (!ordinary || ordinary.kind !== 'payment') throw new Error('Expected ordinary payment preview')
    expect(ordinary.sourceCards ?? []).toEqual([])
  })
})

describe('E060 Working Gloves parity', () => {
  const CARD_ID = 'E060_WorkingGloves'

  const OCCUPATION_ID = 'A116_WoodCutter'

  const FOOD_MINOR_ID = 'A002_ShiftingCultivation'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, playerCount = 3, resources = {},
  }: {
    played?: boolean
    playerCount?: number
    resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
  } = {}) => {
    const session = new GameSession(6060, undefined, { playerCount })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationHand = [OCCUPATION_ID]
    owner.resources.food = 0
    Object.assign(owner.resources, resources)
    session.loadState(state)
    sessions.push(session)
    return session
  }

  const options = (ruleOwner: SessionRuleOwner, response: SessionResponse): ActionChoiceOption[] => response.interaction.stateId === 'wait' && 'options' in response.interaction.request
    ? response.interaction.request.options ?? []
    : []

  const playMinor = (session: GameSession, cardId = CARD_ID) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(session, response).some((option) => option.value === cardId)) {
      const improvement = options(session, response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) {
        response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
      }
    }
    if (response.interaction.stateId !== 'wait') return response
    const card = options(session, response).find((option) => option.value === cardId)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const occupationPayment = (
    session: GameSession,
    choose: (resources: Partial<Record<string, number>>) => boolean,
  ) => {
    let response = session.takeAction(0, 'lessons-3')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait') {
      const occupation = options(session, response).find((option) => option.value === OCCUPATION_ID)
      if (occupation) {
        response = session.resolveChoice(response.interaction.playerIndex, occupation.value)
      }
    }
    if (response.state.players[0]!.occupationPlayed.includes(OCCUPATION_ID)) return response
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'prompt.selectPayment', request: { kind: 'choice' },
    })
    const payment = options(session, response).find((option) => {
      const preview = option.effectPreview
      return preview?.kind === 'payment' && preview.resourcesPaid ? choose(preview.resourcesPaid) : false
    })
    expect(payment, JSON.stringify(response.interaction)).toBeDefined()
    if (response.interaction.stateId !== 'wait') throw new Error('Expected payment choice')
    response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
    return response
  }

  it('E060 S1: playing Working Gloves gains one food', () => {
    const response = playMinor(setup({ played: false, playerCount: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('E060 S2: one wood can replace the two-food occupation cost', () => {
    const session = setup({ resources: { wood: 1 } })

    const response = occupationPayment(session, (paid) => paid.wood === 1 && !paid.food)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })

  it('E060 S3: the normal two-food occupation payment remains selectable', () => {
    const session = setup({ resources: { wood: 1, food: 2 } })

    const response = occupationPayment(session, (paid) => paid.food === 2 && !paid.wood)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })

  it('E060 S4: Working Gloves does not replace a minor improvement food cost', () => {
    const session = setup({ playerCount: 2, resources: { wood: 1 } })
    const state = session.getState().state
    state.players[0]!.minorHand = [FOOD_MINOR_ID]
    session.loadState(state)

    const response = playMinor(session, FOOD_MINOR_ID)

    expect(response.state.players[0]!.minorHand).toContain(FOOD_MINOR_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(FOOD_MINOR_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
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
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); pause = undefined; });
  it("E060 N1 real purchase grants one food and each building resource can replace occupation food", () => { for (const key of ['wood', 'clay', 'reed', 'stone'] satisfies (keyof Resource)[]) {
      const bSession = make('E060_WorkingGloves', st => { st.players[0]!.resources.food = 0; }, false), b = purchase(bSession, 'E060_WorkingGloves');
      resource(b, { food: 1 });
      const s = make('E060_WorkingGloves', st => { occupations(st.players[0]!, 1); st.players[0]!.resources.food = 0; st.players[0]!.resources[key] = 1; });
      const available = s.getActionAvailability(0).lessons, r = s.takeAction(0, 'lessons');
      traces.push({ command: 'takeAction', actor: 0, space: 'lessons', responseOk: r.ok, error: r.error });
      save(`E060-N1-${key}`, { b, r, available });
      assert.deepEqual({ available, ok: r.ok, error: r.error ?? null }, { available: true, ok: true, error: null });
      const target = opts(r).find(option => option.value === 'A125_Priest');
      assert.ok(target?.effectPreview?.kind === 'payment');
      assert.deepEqual(Object.fromEntries(Object.entries(target.effectPreview.resourcesPaid ?? {}).filter(([, amount]) => amount !== 0)), { [key]: 1 });
      assert.deepEqual(target.effectPreview.sourceCards, ['E060_WorkingGloves']);
      const substituted = finish(s, choose(s, 0, target.value));
      resource(substituted, { food: 0, [key]: 0 });
      assert.ok(substituted.state.players[0]!.occupationPlayed.includes('A125_Priest'));
      const played = substituted.state.events.find(event => event.type === 'card.played' && event.cardId === 'A125_Priest');
      assert.ok(played?.type === 'card.played');
      assert.deepEqual(played.payment?.resources, { [key]: 1 });
      assert.deepEqual(played.payment?.bonusSources, ['E060_WorkingGloves']);
      assert.partialDeepStrictEqual(substituted.state.players[0]!.cardStates.E060_WorkingGloves?.extraData?.resourceStats, {
          paid: { [key]: 1 }, saved: { food: 1 },
      });
      save(`E060-N1-${key}-committed`, substituted);
      const controlSession = make('E060_WorkingGloves', st => { occupations(st.players[0]!, 1); st.players[0]!.resources.food = 1; st.players[0]!.resources[key] = 1; });
      take(controlSession, 0, 'lessons');
      const controlPayment = choose(controlSession, 0, 'A125_Priest');
      const ordinary = opts(controlPayment).find(option => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid?.food === 1);
      assert.ok(ordinary, JSON.stringify(controlPayment.interaction));
      const control = finish(controlSession, choose(controlSession, 0, ordinary.value));
      resource(control, { food: 0, [key]: 1 });
      assert.ok(control.state.players[0]!.occupationPlayed.includes('A125_Priest'));
      assert.equal(control.state.players[0]!.cardStates.E060_WorkingGloves?.extraData?.resourceStats, undefined);
      save(`E060-N1-${key}-control`, control);
  } });
  it("E060 N2 free first occupation held card wrong cost and no building resource cannot invent replacement", () => { const f = make('E060_WorkingGloves', st => Object.assign(st.players[0]!.resources, { food: 0, wood: 1 })), free = finish(f, take(f, 0, 'lessons')); resource(free, { food: 0, wood: 1 }); save('E060-N2-free', free); for (const mode of ['hand', 'resource']) {
      const s = make('E060_WorkingGloves', st => { occupations(st.players[0]!, 1); Object.assign(st.players[0]!.resources, { food: 0, wood: mode === 'hand' ? 1 : 0 }); }, mode !== 'hand');
      assert.equal(s.getActionAvailability(0).lessons, false);
      const bad = assertRejectedUnchanged(s, () => s.takeAction(0, 'lessons')), r = finish(s, take(s, 0, 'forest'), true, [], 'E060_WorkingGloves');
      resource(r, { food: 0 });
      save(`E060-N2-${mode}`, { bad, r });
  } });
  it("E060 N3 illegal occupation or payment request rejects before legal food payment and nonoccupation buy remains unmodified", () => { const s = make('E060_WorkingGloves', st => { occupations(st.players[0]!, 1); Object.assign(st.players[0]!.resources, { food: 1, wood: 1 }); }); const p = take(s, 0, 'lessons'); pause = undefined; const wrongActor = assertRejectedUnchanged(s, () => s.resolveChoice(1, 'A125_Priest')); save('E060-N3-payment', { p, wrongActor }); const r = finish(s, p, true, ['"food":1']); resource(r, { food: 0, wood: 1 }); save('E060-N3-legal', r); const t = make('E060_WorkingGloves', st => { st.players[0]!.minorHand.push('E064_SimpleOven'); st.players[0]!.resources.wood = 1; }), m = minor(t); assert.equal(opts(m).some(o => o.value === 'E064_SimpleOven' && !('disabled' in o && o.disabled)), false); const bad = assertRejectedUnchanged(t, () => t.resolveChoice(0, 'E064_SimpleOven')), control = finish(t, choose(t, 0, 'B004_WoodPile')); save('E060-N3-nonoccupation', { m, bad, control }); });
})
