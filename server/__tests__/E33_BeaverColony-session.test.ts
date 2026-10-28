import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, type CardListenerDispatchInput } from '../../shared/cards/card-listeners'
import { E033_BeaverColony_impl } from '../../shared/cards/E/E033_BeaverColony'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/E/E033_BeaverColony'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

const CARD_ID = 'E033_BeaverColony'
const AFTER_SPACE_USE = E033_BeaverColony_impl.listeners?.find(listener => listener.id === 'E33-beaver-colony-after-space-use')
if (!AFTER_SPACE_USE) throw new Error('Beaver Colony space-use listener missing')

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { reed: 1 },
  from: { kind: 'actionSpace', spaceId: 'reed-bank' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const directContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
  actionEvents = transactionEvents,
): { session: GameSession; context: CardListenerDispatchInput } => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  return { session, context: {
    actionHooks: session.actionHooks,
    state,
    player,
    space: state.actionSpaces.find((space) => space.id === 'reed-bank')!,
    actionId: 'reed-bank',
    phase: 'after',
    transactionEvents,
    actionEvents,
    result: { type: 'ok', resourcesGained: { reed: 1 } },
  } }
}

describe('E033_BeaverColony session', () => {
  it('grants bonus VP for reed collected from an action space without result gains', () => {
    const { session: ruleSession1, context: ctx } = directContext([moved()])
    ctx.result = { type: 'ok' }

    const result = ruleSession1.withCtx(() => executeCardListener(AFTER_SPACE_USE, ctx))

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    })
  })

  it('grants bonus VP for gain action reed from a reed action space without result gains', () => {
    const { session: ruleSession2, context: ctx } = directContext([moved({ reason: 'gain' })])
    ctx.result = { type: 'ok' }

    const result = ruleSession2.withCtx(() => executeCardListener(AFTER_SPACE_USE, ctx))

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    })
  })

  it('does not trigger for non-reed events even when result reports reed', () => {
    const { session: ruleSession3, context: ctx } = directContext([moved({ resources: { wood: 1 } })])

    const result = ruleSession3.withCtx(() => executeCardListener(AFTER_SPACE_USE, ctx))

    expect(result).toBeUndefined()
  })

  it('does not trigger without a current reed event', () => {
    const { session: ruleSession4, context: ctx } = directContext([])

    const result = ruleSession4.withCtx(() => executeCardListener(AFTER_SPACE_USE, ctx))

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction reed when actionEvents has no current reed', () => {
    const { session: ruleSession5, context: ctx } = directContext([moved()], [moved({ resources: { wood: 1 } })])

    const result = ruleSession5.withCtx(() => executeCardListener(AFTER_SPACE_USE, ctx))

    expect(result).toBeUndefined()
  })
})

describe('ae-negative-34-scoring', () => {
  const { sessions, actor, save, setup, finish, take, hand, buy, noSource, pasture, animalKeep, bonus, printed, denyMinor } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E033 N1 actual purchase requires a fenced stable and scores one printed point', () => { const card = 'E033_BeaverColony', s = setup(card, 14, st => { hand(st, card); pasture(st, [{ row: 0, col: 3 }], null, 0, true); }); const r = buy(s, card); assert.equal(printed(r, card), 1); save('E033-N1-legal', r); const t = setup(card, 14, st => { hand(st, card); pasture(st, [{ row: 0, col: 3 }]); st.players[0]!.stableTiles = [{ row: 1, col: 3 }]; }); const q = denyMinor(t, card); assert.equal(printed(q, card), 0); save('E033-N1-unfenced', q); });
  it('E033 N2 an empty unstabled pasture cannot satisfy the mandatory empty stabled pasture group', () => { for (const both of [false, true]) {
      const card = 'E033_BeaverColony', s = setup(card, 14, st => { hand(st, card); pasture(st, [{ row: 0, col: 3 }], 'sheep', 1, true, 'p1'); pasture(st, [{ row: 0, col: 4 }], 'sheep', 1, both, 'p2'); });
      let r = buy(s, card);
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg');
      const invalid = r.interaction.request.zones.map(z => ({ ...z, animalType: z.id === 'p1' ? 'sheep' as const : null, animalCount: z.id === 'p1' ? 2 : 0 }));
      if (!both)
          assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), 'confirm', { zones: invalid }));
      else
          assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), 'confirm', { zones: r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg' ? r.interaction.request.zones.map(z => ({ ...z, animalType: ['p1', 'p2'].includes(z.id) ? 'sheep' as const : null, animalCount: ['p1', 'p2'].includes(z.id) ? 1 : 0 })) : [] }));
      r = animalKeep(s, r, req => { for (const z of req.zones) {
          z.animalType = z.id === 'p2' ? 'sheep' : null;
          z.animalCount = z.id === 'p2' ? 2 : 0;
      } });
      assert.deepEqual(r.state.players[0]!.pastures.map(p => p.animalCount), [0, 2]);
      assert.equal(r.state.players[0]!.resources.sheep, 2);
      save(`E033-N2-${both}`, r);
  } });
  it('E033 N3 Reed Bank amounts give one point each while empty hand opponent and unrelated gains exclude', () => { for (const n of [1, 2, 3]) {
      const card = 'E033_BeaverColony', s = setup(card, 14, st => { pasture(st, [{ row: 0, col: 3 }], null, 0, true); st.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed = n; });
      const r = finish(s, take(s, 'reed-bank'), true);
      assert.equal(r.state.players[0]!.resources.reed, n);
      assert.equal(bonus(r, card), 1);
      save(`E033-N3-${n}`, r);
  } for (const mode of ['empty', 'hand', 'opponent', 'unrelated']) {
      const card = 'E033_BeaverColony', s = setup(card, 14, st => { pasture(st, [{ row: 0, col: 3 }], null, 0, true); if (mode === 'empty')
          st.actionSpaces.find(a => a.id === 'reed-bank')!.resources.reed = 0; if (mode === 'hand')
          hand(st, card); if (mode === 'opponent')
          st.currentPlayerIndex = 1; });
      if (mode === 'empty') { const r = assertEmptyAccumulationRejected(s, 0, 'reed-bank'); assert.equal(bonus(r, card), 0); save('E033-N3-empty', r); continue }
      let r = take(s, mode === 'unrelated' ? 'forest' : 'reed-bank');
      noSource(r, card);
      r = finish(s, r, true);
      assert.equal(bonus(r, card), 0);
      save(`E033-N3-${mode}`, r);
  } });
  it('E033 N4 four player Resource Market reed is a space gain but Water Worker card supplied reed is excluded', () => { for (const mode of ['market', 'card']) {
      const card = 'E033_BeaverColony', s = setup(card, 14, st => { pasture(st, [{ row: 0, col: 3 }], null, 0, true); if (mode === 'card')
          st.players[0]!.occupationPlayed.push('D144_WaterWorker'); }, 4);
      const r = finish(s, take(s, mode === 'market' ? 'resource-market-4' : 'fishing'), true);
      assert.equal(r.state.players[0]!.resources.reed, 1);
      assert.equal(bonus(r, card), mode === 'market' ? 1 : 0);
      save(`E033-N4-${mode}`, r);
  } });
})
