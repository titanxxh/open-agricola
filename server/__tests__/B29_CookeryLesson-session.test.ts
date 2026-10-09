import { describe, expect, it } from 'vitest'
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

const CARD_ID = 'B029_CookeryLesson'
const OCCUPATION_ID = 'A123_FrameBuilder'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setActionToken = (player: PlayerState, token: number) => {
  recordActionSnapshot(player, token)
}

const runFlow = (flow: ActionFlow, state: GameState, player: PlayerState) => {
  if (flow.type !== 'leaf') {
    if ('children' in flow) flow.children.forEach((child) => runFlow(child, state, player))
    return
  }
  const action = flow.actionId === 'special-effect'
    ? specialEffectAction
    : flow.actionId === 'bonus-vp'
      ? bonusVpAction
      : undefined
  action?.execute({
    state,
    player,
    params: flow.params,
    sourceCard: flow.sourceCard,
    actionContext: flow.actionContext,
  } as never)
}

const invokeListener = (
  listener: NonNullable<ReturnType<typeof findListener>>,
  context: CardListenerContext,
) => {
  const result = executeCardListener(listener, context)
  if (result?.flow) runFlow(result.flow, context.state, context.player)
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
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    expect(exchangeListener).toBeDefined()
    expect(placeListener).toBeDefined()

    const { state, player } = setup()
    setActionToken(player, 100)

    // 1) Place farmer on lessons → no VP yet (no cook stamp)
    let result = invokeListener(placeListener!, {
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
    result = invokeListener(exchangeListener!, {
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
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 200)

    let result = invokeListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(false)

    result = invokeListener(placeListener!, {
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
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 201)

    let result = invokeListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)
    expect(hasAction(result?.flow, 'bonus-vp')).toBe(false)

    result = invokeListener(placeListener!, {
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
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()

    setActionToken(player, 100)
    invokeListener(exchangeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'anytime-exchange' }),
      actionId: 'anytime-exchange',
      phase: 'after',
      result: { type: 'ok' },
      actionEvents: [exchangedForFood(player)],
    } as CardListenerContext)

    // Action token advances → next farmer placement
    setActionToken(player, 101)
    const result = invokeListener(placeListener!, {
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
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 300)

    const result = invokeListener(placeListener!, {
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
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const { state, player } = setup()
    setActionToken(player, 400)

    const result = invokeListener(exchangeListener!, {
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
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 500)

    // First lessons placement (no VP yet)
    invokeListener(placeListener!, {
      state,
      player,
      space: mkActionSpace({ id: 'lessons' }),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext)

    // First cook → VP awarded, USED_ACTION_TOKEN_KEY = 500
    let result = invokeListener(exchangeListener!, {
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
    result = invokeListener(exchangeListener!, {
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
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const { state, player } = setup()
    setActionToken(player, 550)

    const result = invokeListener(exchangeListener!, {
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
    const exchangeListener = findListener('B29-cookery-lesson-after-exchange')
    const { state, player } = setup()
    player.minorPlayed.push('B032_Kettle')
    setActionToken(player, 551)

    const result = invokeListener(exchangeListener!, {
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
    const placeListener = findListener('B29-cookery-lesson-after-place-farmer')
    const { state, player } = setup()
    setActionToken(player, 600)
    writeCardExtraData(player, CARD_ID, 'lessonsActionToken', -1)

    const result = invokeListener(placeListener!, {
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
