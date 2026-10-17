import { describe, expect, it, afterEach } from 'vitest'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { resourceOptions, setupResourceAction } from './_helpers/batch07-resource-ownership'

import '../../shared/cards/C/C036_ClayDeposit'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

describe('C036 Clay Deposit through Session', () => {
  it('returns one collected clay to its space and gains one bonus point', () => {
    const session = setupResourceAction('C036_ClayDeposit', 'clay-pit')
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(session.state)
    let response = resolveTriggerIfPresent(session, session.takeAction(0, 'clay-pit'), 'C036_ClayDeposit')
    const accept = resourceOptions(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay).toBe(1)
    expect(response.state.players[0]!.cardStates.C036_ClayDeposit?.counters?.bonusVp).toBe(1)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', resources: { clay: 1 },
      from: { kind: 'player', playerId: response.state.players[0]!.id },
      to: { kind: 'actionSpace', spaceId: 'clay-pit' },
    }))
  })

  it('decline keeps all collected clay and grants no point', () => {
    const session = setupResourceAction('C036_ClayDeposit', 'clay-pit')
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(session.state)
    const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'clay-pit'), 'C036_ClayDeposit')
    expect(offered.interaction.stateId).toBe('wait')
    const response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources.clay).toBe(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay).toBe(0)
    expect(response.state.players[0]!.cardStates.C036_ClayDeposit?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('ae-negative-34-scoring', () => {
  const { sessions, save, setup, finish, take, prerequisites, hand, buy, noSource, bonus, printed, denyMinor } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C036 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'C036_ClayDeposit', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 1); Object.assign(st.players[0]!.resources, { food: 2 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.food, 0); save('C036-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 1); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 1 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C036-N1-resource', q);
  } {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 2 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C036-N1-occupation', q);
  } });
  it('C036 N2 exact clay return stays on original accumulation and buys only one point', () => { const card = 'C036_ClayDeposit', s = setup(card); const r = finish(s, take(s, 'clay-pit'), true); assert.equal(r.state.players[0]!.resources.clay, 1); assert.equal(r.state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay, 1); assert.equal(bonus(r, card), 1); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'flow-7')); assert.equal(bonus(s.getState(), card), 1); save('C036-N2', r); });
  it('C036 N3 decline hand opponent unrelated and empty pile cannot exchange absent clay', () => { for (const mode of ['decline', 'hand', 'opponent', 'unrelated', 'empty', 'empty-owned']) {
      const card = 'C036_ClayDeposit', s = setup(card, 14, st => { if (mode === 'hand')
          hand(st, card); if (mode === 'opponent')
          st.currentPlayerIndex = 1; if (mode.startsWith('empty'))
          st.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay = 0; if (mode === 'empty-owned')
          st.players[0]!.resources.clay = 1; });
      if (mode.startsWith('empty')) { const r = assertEmptyAccumulationRejected(s, 0, 'clay-pit'); assert.equal(bonus(r, card), 0); assert.equal(r.state.players[0]!.resources.clay, mode === 'empty-owned' ? 1 : 0); save(`C036-N3-${mode}`, r); continue }
      let r = take(s, mode === 'unrelated' ? 'forest' : 'clay-pit');
      if (['hand', 'opponent', 'unrelated'].includes(mode))
          noSource(r, card);
      r = finish(s, r, mode !== 'decline');
      assert.equal(bonus(r, card), 0);
      assert.equal(r.state.actionSpaces.find(a => a.id === 'clay-pit')!.resources.clay, mode === 'unrelated' ? 2 : 0);
      save(`C036-N3-${mode}`, r);
  } });
})
