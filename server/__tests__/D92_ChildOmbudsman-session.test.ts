import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { D092_ChildOmbudsman_impl } from '../../shared/cards/D/D092_ChildOmbudsman'
import {
  setActiveWorkerCount,
  setNewbornCount,
  familySize,
} from '../../shared/domain/player'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import type { ActionHookPhase, ActionHookResult } from '../../shared/actions/hooks'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import assert from 'node:assert/strict'
import * as audit45Placement from './_helpers/audit/ae-negative-45-placement'

const CARD_ID = 'D092_ChildOmbudsman'

const makeCtx = (round: number, rooms: number, family: number) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.round = round
  const player = state.players[0]!
  player.rooms = rooms
  player.occupationPlayed.push(CARD_ID)
  setActiveWorkerCount(player, family)
  setNewbornCount(player, 0)
  return { session: session, state, player }
}

describe('D92 Child Ombudsman — listener', () => {
  it('does not offer SEQ in round 4 (round < 5)', () => {
    const { session: ruleSession, state, player } = makeCtx(4, 3, 2)
    const handler = D092_ChildOmbudsman_impl.listeners[0]!.handler
    const ctx = {
      actionHooks: ruleSession.actionHooks,
      state,
      player,
      actionId: 'place-farmer',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(ruleSession.withCtx(() => handler(ctx))).toBeUndefined()
  })

  it('does not offer SEQ when no free room (rooms === familySize)', () => {
    const { session: ruleSession, state, player } = makeCtx(5, 2, 2)
    const handler = D092_ChildOmbudsman_impl.listeners[0]!.handler
    const ctx = {
      actionHooks: ruleSession.actionHooks,
      state,
      player,
      actionId: 'place-farmer',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    expect(ruleSession.withCtx(() => handler(ctx))).toBeUndefined()
  })

  it('offers SEQ optional with [special-effect, family-growth] in round 5 with free room', () => {
    const { session: ruleSession, state, player } = makeCtx(5, 3, 2)
    const handler = D092_ChildOmbudsman_impl.listeners[0]!.handler
    const ctx = {
      actionHooks: ruleSession.actionHooks,
      state,
      player,
      actionId: 'place-farmer',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    const result = ruleSession.withCtx(() => handler(ctx)) as ActionHookResult | undefined
    expect(result).toBeTruthy()
    expect(result?.sourceCard).toBe(CARD_ID)
    const flow = result?.flow as {
      type: 'seq'
      optional?: boolean
      children: { type: string; actionId?: string; sourceCard?: string; params?: { kind?: string; key?: string; amount?: number } }[]
    } | undefined
    expect(flow?.type).toBe('seq')
    expect(flow?.optional).toBe(true)
    expect(flow?.children).toHaveLength(2)
    // First child mutates negativeScore via special-effect leaf (no direct
    // writeCardExtraData inside the handler).
    expect(flow?.children[0]!.actionId).toBe('special-effect')
    expect(flow?.children[0]!.sourceCard).toBe(CARD_ID)
    expect(flow?.children[0]!.params?.kind).toBe('increment-extra-data')
    expect(flow?.children[0]!.params?.key).toBe('negativeScore')
    expect(flow?.children[0]!.params?.amount).toBe(2)
    // Second child performs the free family-growth.
    expect(flow?.children[1]!.actionId).toBe('family-growth')
    expect(flow?.children[1]!.sourceCard).toBe(CARD_ID)
  })

  it('listener handler does NOT mutate negativeScore directly (engine-mediated)', () => {
    const { session: ruleSession, state, player } = makeCtx(5, 3, 2)
    const handler = D092_ChildOmbudsman_impl.listeners[0]!.handler
    const before = readCardExtraData<number>(player, CARD_ID, 'negativeScore') ?? 0
    ruleSession.withCtx(() => handler({
      actionHooks: ruleSession.actionHooks,
      state,
      player,
      actionId: 'place-farmer',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext))
    const after = readCardExtraData<number>(player, CARD_ID, 'negativeScore') ?? 0
    expect(after).toBe(before) // unchanged: mutation only happens via special-effect leaf
  })

  it('computeBonusScore: returns -negativeScore (post-mutation total)', () => {
    const { session: ruleSession, state, player } = makeCtx(5, 3, 2)
    writeCardExtraData(player, CARD_ID, 'negativeScore', 6)
    const compute = D092_ChildOmbudsman_impl.effect.computeBonusScore!
    expect(ruleSession.withCtx(() => compute(state, player))).toBe(-6)
  })

  it('computeBonusScore: 0 when no mutation has happened', () => {
    const { session: ruleSession, state, player } = makeCtx(5, 3, 2)
    const compute = D092_ChildOmbudsman_impl.effect.computeBonusScore!
    expect(Math.abs(ruleSession.withCtx(() => compute(state, player)))).toBe(0)
  })
})

describe('ae-negative-45-placement', () => {
  const { sessions, save, ok, setup, finish } = audit45Placement
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D092 N1 round five successful free growth records exactly negative two authoritative card points while decline records zero', () => { for (const accept of [true, false]) {
    const s = setup('D092_ChildOmbudsman', state => { state.players[0]!.rooms = 3; state.players[0]!.roomTiles.push({ row: 0, col: 0 }); }, 5)
    const r = finish(s, ok(s.takeAction(0, 'day-laborer')), accept)
    assert.equal(familySize(r.state.players[0]!), accept ? 3 : 2)
    const score = r.scores![0]!.categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => 'cardId' in e && e.cardId === 'D092_ChildOmbudsman')?.score ?? 0
    assert.equal(score, accept ? -2 : 0)
    assert.equal(r.state.players[0]!.resources.food, 4)
    save(`D092-N1-${accept}`, r)
  } })
  it('D092 N2 before round five and house without free room cannot grow after real person action', () => { for (const mode of ['round', 'room']) {
    const s = setup('D092_ChildOmbudsman', state => { if (mode === 'round') {
      state.players[0]!.rooms = 3
      state.players[0]!.roomTiles.push({ row: 0, col: 0 })
    } }, mode === 'round' ? 4 : 5)
    const r = finish(s, ok(s.takeAction(0, 'day-laborer')))
    assert.equal(familySize(r.state.players[0]!), 2)
    assert.equal(r.state.players[0]!.cardStates.D092_ChildOmbudsman?.extraData?.negativeScore ?? 0, 0)
    save(`D092-N2-${mode}`, r)
  } })
})
