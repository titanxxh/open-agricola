import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import { recordActionSnapshot } from '../../shared/cards/helpers/action-snapshot'
import type { ActionFlow, GameState, PlayerState } from '../../shared/contract/types'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import { bonusVpAction } from '../../shared/actions/effects/bonus-vp'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/B/B029_CookeryLesson'
import '../../shared/cards/B/B032_Kettle'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit19Cooking from './_helpers/audit/ae-negative-19-cooking'

const CARD_ID = 'B029_CookeryLesson'
const OCCUPATION_ID = 'A123_FrameBuilder'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

const setActionToken = (ruleOwner: SessionRuleOwner, player: PlayerState, token: number) => {
  const lookupRule1 = () => recordActionSnapshot(player, token)
  ruleOwner.withCtx(lookupRule1)
}

const runFlow = (ruleOwner: GameSession, flow: ActionFlow, state: GameState, player: PlayerState) => {
  if (flow.type !== 'leaf') {
    if ('children' in flow) flow.children.forEach((child) => runFlow(ruleOwner, child, state, player))
    return
  }
  const action = flow.actionId === 'special-effect'
    ? specialEffectAction
    : flow.actionId === 'bonus-vp'
      ? bonusVpAction
      : undefined
  ruleOwner.withCtx(() => action?.execute({
    actionHooks: ruleOwner.actionHooks,
    state,
    player,
    params: flow.params,
    sourceCard: flow.sourceCard,
    actionContext: flow.actionContext,
  } as never))
}

const invokeListener = (ruleOwner: SessionRuleOwner,
  listener: NonNullable<ReturnType<typeof findListener>>,
  context: CardListenerContext,
) => {
  const lookupRule2 = () => executeCardListener(listener, context)
  const result = (ruleOwner.withCtx(lookupRule2))
  if (result?.flow) runFlow(ruleOwner, result.flow, context.state, context.player)
  return result
}

const hasAction = (flow: ActionFlow | undefined, actionId: string): boolean => {
  if (!flow) return false
  if (flow.type === 'leaf') return flow.actionId === actionId
  return 'children' in flow && flow.children.some((child) => hasAction(child, actionId))
}

const exchangedForFood = (
  player: PlayerState,
  exchangeSource = 'Major_Fireplace1',
  paid: DraftGameEvent<'resource.exchanged'>['paid'] = { sheep: 1 },
): DraftGameEvent<'resource.exchanged'> => ({
  type: 'resource.exchanged',
  paid,
  gained: { food: 2 },
  paidFrom: { kind: 'player', playerId: player.id },
  paidTo: { kind: 'supply' },
  gainedFrom: { kind: 'supply' },
  gainedTo: { kind: 'player', playerId: player.id },
  exchangeSource,
})

const setupLessonsExchangeSession = (exchangeSource: 'kettle' | 'fireplace') => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = [CARD_ID]
  player.occupationHand = [OCCUPATION_ID, 'A124_Knapper']
  player.resources = {
    ...player.resources,
    food: 10,
    grain: exchangeSource === 'kettle' ? 1 : 0,
    sheep: exchangeSource === 'fireplace' ? 1 : 0,
  }
  if (exchangeSource === 'kettle') player.minorPlayed.push('B032_Kettle')
  if (exchangeSource === 'fireplace') player.improvements = ['Major_Fireplace1']
  session.loadState(state)
  return session
}

const useLessonsAndExchange = (
  session: GameSession,
  exchangeSource: 'B032_Kettle' | 'Major_Fireplace1',
) => {
  let resp = session.takeAction(0, 'lessons')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  expect(resp.interaction.request.options?.map((option) => option.value)).toContain(OCCUPATION_ID)

  resp = session.takeAnytimeAction(0, 'exchange')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  resp = session.resolveChoice(0, 'bulk:0=1')
  expect(resp.ok).toBe(true)
  expect(resp.state.events).toContainEqual(expect.objectContaining({
    type: 'resource.exchanged',
    exchangeSource,
  }))
  expect(resp.interaction.stateId).toBe('wait')
  expect(resp.interaction.request.options?.map((option) => option.value)).toContain(OCCUPATION_ID)

  resp = session.resolveChoice(0, OCCUPATION_ID)
  expect(resp.ok).toBe(true)
  expect(resp.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
  expect(resp.state.log).toContainEqual(expect.objectContaining({
    key: 'log.placeFarmer',
    params: expect.objectContaining({ action: 'actions.lessons.name' }),
  }))
  return resp
}

describe('B029_CookeryLesson — real Lessons exchange flow', () => {
  it('does not count Kettle grain-to-food as cooking', () => {
    const resp = useLessonsAndExchange(
      setupLessonsExchangeSession('kettle'),
      'B032_Kettle',
    )

    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    expect(resp.scores?.[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
  })

  it('counts Fireplace sheep-to-food as cooking', () => {
    const resp = useLessonsAndExchange(
      setupLessonsExchangeSession('fireplace'),
      'Major_Fireplace1',
    )

    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(resp.scores?.[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total).toBe(1)
  })
})

describe('B029_CookeryLesson — per-action token tracking, not per-round', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.improvements.push('Major_Fireplace1')
    return { session, state, player }
  }

  it('lessons placement first, then cook in same action → 1 VP awarded on cook', () => {


    const { session: ruleSession, state, player } = setup()
    const exchangeListener = findListener(ruleSession, 'B29-cookery-lesson-after-exchange')
    const placeListener = findListener(ruleSession, 'B29-cookery-lesson-after-place-farmer')
    expect(exchangeListener).toBeDefined()
    expect(placeListener).toBeDefined()
    setActionToken(ruleSession, player, 100)

    // 1) Place farmer on lessons → no VP yet (no cook stamp)
    let result = invokeListener(ruleSession, placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(false)
    expect(readCardExtraData<number>(player, CARD_ID, 'lessonsActionToken')).toBe(100)

    // 2) anytime-exchange (cook) in same action → VP
    result = invokeListener(ruleSession, exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(true)
    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('cook first, then lessons in same action → 1 VP awarded on lessons', () => {


    const { session: ruleSession, state, player } = setup()
    const exchangeListener = findListener(ruleSession, 'B29-cookery-lesson-after-exchange')
    const placeListener = findListener(ruleSession, 'B29-cookery-lesson-after-place-farmer')
    setActionToken(ruleSession, player, 200)

    let result = invokeListener(ruleSession, exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(false)

    result = invokeListener(ruleSession, placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons-4' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(true)
  })

  it('cook first, then lessons-3 in same action → 1 VP awarded on lessons', () => {


    const { session: ruleSession, state, player } = setup()
    const exchangeListener = findListener(ruleSession, 'B29-cookery-lesson-after-exchange')
    const placeListener = findListener(ruleSession, 'B29-cookery-lesson-after-place-farmer')
    setActionToken(ruleSession, player, 201)

    let result = invokeListener(ruleSession, exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(false)

    result = invokeListener(ruleSession, placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons-3' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(true)
  })

  it('cook in action 100, lessons in action 101 → NO VP (per-action gating)', () => {


    const { session: ruleSession, state, player } = setup()
    const exchangeListener = findListener(ruleSession, 'B29-cookery-lesson-after-exchange')
    const placeListener = findListener(ruleSession, 'B29-cookery-lesson-after-place-farmer')

    setActionToken(ruleSession, player, 100)
    invokeListener(ruleSession, exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)

    // Action token advances → next farmer placement
    setActionToken(ruleSession, player, 101)
    const result = invokeListener(ruleSession, placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    // lessons stamp is now 101, cooked stamp is 100 — no match
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(false)
  })

  it('lessons alone (no cook) → no VP', () => {

    const { session: ruleSession, state, player } = setup()
    const placeListener = findListener(ruleSession, 'B29-cookery-lesson-after-place-farmer')
    setActionToken(ruleSession, player, 300)

    const result = invokeListener(ruleSession, placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(false)
  })

  it('cook alone (no lessons) → no VP', () => {

    const { session: ruleSession, state, player } = setup()
    const exchangeListener = findListener(ruleSession, 'B29-cookery-lesson-after-exchange')
    setActionToken(ruleSession, player, 400)

    const result = invokeListener(ruleSession, exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(false)
  })

  it('multiple cook calls in same action with lessons stamped → only 1 VP (USED_ACTION_TOKEN dedup)', () => {


    const { session: ruleSession, state, player } = setup()
    const exchangeListener = findListener(ruleSession, 'B29-cookery-lesson-after-exchange')
    const placeListener = findListener(ruleSession, 'B29-cookery-lesson-after-place-farmer')
    setActionToken(ruleSession, player, 500)

    // First lessons placement (no VP yet)
    invokeListener(ruleSession, placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    // First cook → VP awarded, USED_ACTION_TOKEN_KEY = 500
    let result = invokeListener(ruleSession, exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(true)

    // Second cook in same action → no VP (already used this action)
    result = invokeListener(ruleSession, exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(false)
  })

  it('does not stamp cooking for grain-to-food from a cookery source', () => {

    const { session: ruleSession, state, player } = setup()
    const exchangeListener = findListener(ruleSession, 'B29-cookery-lesson-after-exchange')
    setActionToken(ruleSession, player, 550)

    const result = invokeListener(ruleSession, exchangeListener!, {
      state,
      player,
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player, 'Major_Fireplace1', { grain: 1 })],
    } as CardListenerContext)

    expect(result).toBeUndefined()
    expect(readCardExtraData<number>(player, CARD_ID, 'cookedActionToken')).toBeUndefined()
  })

  it('does not stamp cooking for animal-to-food from a non-cookery source', () => {

    const { session: ruleSession, state, player } = setup()
    const exchangeListener = findListener(ruleSession, 'B29-cookery-lesson-after-exchange')
    player.minorPlayed.push('B032_Kettle')
    setActionToken(ruleSession, player, 551)

    const result = invokeListener(ruleSession, exchangeListener!, {
      state,
      player,
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player, 'B032_Kettle')],
    } as CardListenerContext)

    expect(result).toBeUndefined()
    expect(readCardExtraData<number>(player, CARD_ID, 'cookedActionToken')).toBeUndefined()
  })

  it('non-lessons place-farmer does not stamp lessonsActionToken', () => {

    const { session: ruleSession, state, player } = setup()
    const placeListener = findListener(ruleSession, 'B29-cookery-lesson-after-place-farmer')
    setActionToken(ruleSession, player, 600)
    writeCardExtraData(player, CARD_ID, 'lessonsActionToken', -1)

    const result = invokeListener(ruleSession, placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'forest' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)
    expect(result).toBeUndefined()
    expect(readCardExtraData<number>(player, CARD_ID, 'lessonsActionToken')).toBe(-1)
  })
})

describe('ae-negative-19-cooking', () => {
  const { CARD, OCC, sessions, save, ok, setup, turn, points, exchange, cook, occupation } = audit19Cooking
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B029 N1 actual two food purchase has no immediate bonus and one food cannot buy',()=>{const s=setup(false);let pending=turn(s,0,'meeting-place');if(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice'){const o=pending.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)pending=ok(s.resolveChoice(0,o.value))}const r=ok(s.resolveChoice(0,CARD));assert.equal(r.state.players[0]!.resources.food,18);assert.equal(points(r),0);const poor=setup(false,state=>state.players[0]!.resources.food=1);let denied=turn(poor,0,'meeting-place');if(denied.interaction.stateId==='wait'&&denied.interaction.request.kind==='choice'){const o=denied.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)denied=ok(poor.resolveChoice(0,o.value))}assertRejectedUnchanged(poor,()=>poor.resolveChoice(0,CARD));const legal=ok(poor.resolveChoice(0,'A030_BakingSheet'));assert.equal(legal.state.players[0]!.resources.food,1);assert.equal(points(legal),0);save('B029-N1',{pending,r,denied,legal})})
  it('B029 N2 actual Lessons pending with vegetable cooking twice awards one bonus for the whole turn',()=>{const s=setup(),lesson=turn(s,0,'lessons'),first=cook(s),second=cook(s),r=occupation(s);assert.equal(r.state.players[0]!.resources.vegetable,0);assert.equal(r.state.players[0]!.resources.food,24);assert.equal(points(r),1);assert.ok(r.state.players[0]!.occupationPlayed.includes(OCC));assert.ok(r.state.events.some(e=>e.type==='resource.exchanged'&&e.exchangeSource==='Major_Fireplace1'));save('B029-N2',{lesson,first,second,r})})
  it('B029 N3 Kettle grain conversion during actual Lessons and cooking during unrelated action cannot award bonus',()=>{const kettle=setup(true,state=>{state.players[0]!.minorPlayed.push('B032_Kettle');state.players[0]!.improvements=[];state.players[0]!.resources.grain=1}),lesson=turn(kettle,0,'lessons'),traded=exchange(kettle,0),r=occupation(kettle);assert.equal(r.state.players[0]!.resources.food,23);assert.equal(points(r),0);const unrelated=setup(),pending=turn(unrelated,0,'major-improvement'),cooked=cook(unrelated);ok(unrelated.resolveChoice(0,'A030_BakingSheet'));assert.equal(points(cooked.r),0);save('B029-N3',{lesson,traded,r,pending,cooked})})
  it('B029 N4 hand Lessons cooking gives no bonus and undo actual Lessons plus cooking restores food crop score and occupation',()=>{const hand=setup(false);turn(hand,0,'lessons');cook(hand);const h=occupation(hand);assert.equal(points(h),0);const s=setup();turn(s,0,'lessons');cook(s);const r=occupation(s),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,20);assert.equal(undone.state.players[0]!.resources.vegetable,2);assert.equal(points(undone),0);assert.ok(undone.state.players[0]!.occupationHand.includes(OCC));turn(s,0,'lessons');cook(s);const retry=occupation(s);assert.equal(points(retry),1);assert.equal(retry.state.players[0]!.resources.vegetable,1);save('B029-N4',{h,r,undone,retry})})
})
