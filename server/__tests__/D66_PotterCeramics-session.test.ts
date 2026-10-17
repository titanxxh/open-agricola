import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import '../../shared/cards/B/B026_AgrarianFences'
import '../../shared/cards/D/D066_PotterCeramics'
import '../../shared/cards/__stubs__/STUB_BeforeBakeGainClay'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

const CARD_ID = 'D066_PotterCeramics'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const waiting = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected pending interaction')
  return response.interaction
}

const choices = (response: SessionResponse) => {
  const request = waiting(response).request
  if (request.kind !== 'choice') throw new Error('Expected choice interaction')
  return request.options
}

const chooseLabel = (session: GameSession, response: SessionResponse, labelKey: string) => {
  const option = choices(response).find((candidate) => candidate.labelKey === labelKey
    || candidate.labelParams?.actionNameKey === labelKey)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const setup = (overrides: {
  clay?: number
  grain?: number
  improvements?: string[]
  extraPlayedCards?: string[]
} = {}) => {
  const session = createWorkSession({ configure: (state) => {
    state.round = 1
    const player = state.players[0]!
    Object.assign(player.resources, {
      clay: overrides.clay ?? 1,
      grain: overrides.grain ?? 0,
      food: 0,
    })
    player.improvements = overrides.improvements ?? ['Major_Fireplace1']
    player.minorPlayed.push(CARD_ID, ...(overrides.extraPlayedCards ?? []))
  } })
  sessions.push(session)
  return session
}

describe('D066_PotterCeramics session', () => {
  it('offers optional D66 before bake and uses it to make bake non-empty', () => {
    const session = setup()

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(waiting(resp).promptKey).toBe('ui.interactionOptionalAction')
    expect(waiting(resp).sourceCard).toBe(CARD_ID)

    const d66 = choices(resp).find((option) => option.value !== '__skip__')
    expect(d66).toBeDefined()
    resp = session.resolveChoice(0, d66!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    if (resp.interaction.stateId === 'wait' && waiting(resp).promptKey === 'ui.interactionBakeBreadChoice') {
      expect(waiting(resp).promptKey).toBe('ui.interactionBakeBreadChoice')
      expect(choices(resp).map((option) => option.value)).toContain('Major_Fireplace1')
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('does not offer D66 when player has no bake source', () => {
    const session = setup({ improvements: [], clay: 1, grain: 0 })

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    const resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(false)
  })

  it('can skip D66 after B26 replacement chooses bake plus fences when fencing can continue without it', () => {
    const session = setup({
      clay: 1,
      grain: 1,
      extraPlayedCards: ['B026_AgrarianFences'],
    })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 15
    player.fields = []
    session.loadState(state)

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(waiting(resp).promptKey).toBe('ui.interactionSelectReplacement')
    const source = choices(resp).find((option) => option.sourceCard === 'B026_AgrarianFences')!
    resp = session.resolveChoice(0, source.value)
    resp = chooseLabel(session, resp, 'ui.interactionAgrarianFencesBakeAndFence')
    resp = chooseLabel(session, resp, 'actions.bake-bread.name')
    expect(waiting(resp).promptKey).toBe('ui.interactionOptionalAction')
    expect(waiting(resp).sourceCard).toBe(CARD_ID)

    resp = session.resolveChoice(0, '__skip__')
    if (waiting(resp).promptKey === 'ui.interactionBakeBreadChoice') resp = session.resolveChoice(0, 'Major_Fireplace1')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(1)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.state.players[0]!.resources.food).toBe(2)
    resp = chooseLabel(session, resp, 'actions.fencing.name')
    expect(waiting(resp).promptKey).toBe('ui.interactionFenceSelect')
    resp = session.commitSelectionChoice(0, { edges: ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5'], palisadeEdges: [], extraWood: 0 })
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 11, clay: 1, grain: 0, food: 2 })
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(resp.state.events.some((event) => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toBe(false)
    expect(waiting(resp).request.kind, JSON.stringify(resp.interaction)).toBe('confirm-next-player')
    expect(resp.scores).toHaveLength(2)
    expect(resp.state.log.length).toBeGreaterThan(0)
  })
})

describe('ae-negative-40-crops', () => {
  const { sessions, ok, options, actor, save, setup, choose, finish, offer, take, hand, buy, accept, printed, ownMajor, bake, enterBake } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D066 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'D066_PotterCeramics'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, {}); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); save("D066-N1-legal", r); });
  it('D066 N2 real pre bake clay exchange supplies one grain that is actually baked normally', () => { for (const clay of [1, 2]) {
      const card = 'D066_PotterCeramics', s = setup(card, 14, st => { ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.clay = clay; });
      let r = enterBake(s);
      save(`D066-N2-before-${clay}`, r);
      r = accept(s, r, card);
      assert.equal(r.state.players[0]!.resources.clay, clay - 1);
      r = bake(s, r);
      assert.equal(r.state.players[0]!.resources.food, 42);
      assert.equal(r.state.players[0]!.resources.grain, 0);
      assert.equal(r.state.players[0]!.resources.clay, clay - 1);
      save(`D066-N2-${clay}`, r);
  } });
  it('D066 N3 decline hand no clay no bake source and unrelated action cannot exchange clay', () => { for (const mode of ['decline', 'hand', 'no-clay', 'no-bake', 'unrelated']) {
      const card = 'D066_PotterCeramics', s = setup(card, 14, st => { if (mode !== 'no-bake')
          ownMajor(st, 'Major_Fireplace1'); Object.assign(st.players[0]!.resources, { clay: mode === 'no-clay' ? 0 : 1, grain: mode === 'no-bake' ? 0 : 1 }); if (mode === 'hand')
          hand(st, card); });
      let r = s.getState();
      if (mode === 'no-bake')
          assertRejectedUnchanged(s, () => s.takeAction(0, 'grain-utilization'));
      else if (mode === 'unrelated')
          r = finish(s, take(s, 'forest'));
      else {
          r = enterBake(s);
          if (mode === 'decline') {
              r = offer(s, r, card);
              r = choose(s, r, o => o.value === '__skip__');
          }
          r = bake(s, r);
      }
      assert.equal(r.state.players[0]!.resources.clay, mode === 'no-clay' ? 0 : 1);
      assert.equal(r.state.players[0]!.resources.food, ['no-bake', 'unrelated'].includes(mode) ? 40 : 42);
      save(`D066-N3-${mode}`, r);
  } });
  it('D066 N4 declining the only grain source cannot complete the space without a normal bake', () => { const card = 'D066_PotterCeramics', s = setup(card, 14, st => { ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.clay = 1; }); let r = enterBake(s); save('D066-N4-before', r); r = offer(s, r, card); if (options(r).some(o => o.value === '__skip__'))
      r = s.resolveChoice(actor(r), '__skip__'); save('D066-N4-after-decline', r); const emptyCompleted = r.ok && (r.interaction.stateId === 'idle' || (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')); assert.deepEqual({ emptyCompleted, food: r.state.players[0]!.resources.food, grain: r.state.players[0]!.resources.grain, clay: r.state.players[0]!.resources.clay }, { emptyCompleted: false, food: 40, grain: 0, clay: 1 }); assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='engine-blocked'&&r.interaction.request.actionId==='bake-bread');assert.ok(r.interaction.allowedCommands.includes('undoAction'));r=ok(s.undoAction());assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.players[0]!.resources.clay,1);save('D066-N4-undone',r);r=accept(s,enterBake(s),card);r=bake(s,r);assert.equal(r.state.players[0]!.resources.food,42);assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.clay,0);save('D066-N4-legal-retry',r); });
})
