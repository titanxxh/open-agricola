import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { A048_ShavingHorse_impl } from '../../shared/cards/A/A048_ShavingHorse'
import '../../shared/cards/A/A048_ShavingHorse'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Fields from './_helpers/audit/ae-negative-08-fields'

const CARD_ID = 'A048_ShavingHorse'
const AFTER_OBTAIN = A048_ShavingHorse_impl.listeners.find((listener) => listener.id === 'A48-shaving-horse-after-obtain')!
const AFTER_EXCHANGE = A048_ShavingHorse_impl.listeners.find((listener) => listener.id === 'A48-shaving-horse-after-exchange')!

type SetupOptions = {
  forestWood?: number
  playerWood?: number
  playerFood?: number
  cardPlayed?: boolean
}

const setup = (options: SetupOptions = {}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  if (options.cardPlayed !== false) {
    player.minorPlayed.push(CARD_ID)
  }
  player.resources.wood = options.playerWood ?? 0
  player.resources.food = options.playerFood ?? 0

  const forest = state.actionSpaces.find((s) => s.id === 'forest')!
  forest.resources.wood = options.forestWood ?? 3

  session.loadState(state)
  return session
}

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { wood: 1 },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'gain',
  ...overrides,
})

const exchanged = (
  overrides: Partial<DraftGameEvent<'resource.exchanged'>> = {},
): DraftGameEvent<'resource.exchanged'> => ({
  type: 'resource.exchanged',
  paid: { food: 1 },
  gained: { wood: 1 },
  paidFrom: { kind: 'player', playerId: 'p1' },
  paidTo: { kind: 'supply' },
  gainedFrom: { kind: 'supply' },
  gainedTo: { kind: 'player', playerId: 'p1' },
  exchangeSource: 'test',
  ...overrides,
})

const directContext = (
  actionId: 'gain' | 'exchange',
  transactionEvents: DraftGameEvent[],
): { session: GameSession; context: CardListenerContext } => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  player.resources.wood = 5
  return { session, context: {
    actionHooks: session.actionHooks,
    state,
    player,
    space: state.actionSpaces.find((space) => space.id === 'forest')!,
    actionId,
    phase: 'after',
    transactionEvents,
    actionEvents: transactionEvents,
    result: { type: 'ok', resourcesGained: { wood: 1 } },
  } as unknown as CardListenerContext }
}

const resolveShavingHorseTriggerIfPresent = (
  session: GameSession,
  resp: ReturnType<GameSession['takeAction']>,
) => {
  if (resp.interaction.stateId !== 'wait') return resp
  if (resp.interaction.request.kind !== 'select-trigger') return resp
  const option = resp.interaction.request.options?.find((entry) => entry.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

describe('A048_ShavingHorse session', () => {
  it('does not trigger when card not played', () => {
    const session = setup({ forestWood: 3, playerWood: 4, cardPlayed: false })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(7)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('does not trigger when total wood < 5 after collect', () => {
    const session = setup({ forestWood: 3, playerWood: 1 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('rejects an empty wood space without triggering an exchange', () => {
    const session = setup({ forestWood: 0, playerWood: 6 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(false)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.wood).toBe(6)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.actionSpaces.find(space => space.id === 'forest')!.takenBy).toEqual([])
  })

  it('offers optional exchange when wood reaches 5', () => {
    const session = setup({ forestWood: 3, playerWood: 2 }) // after collect: 5
    const resp = resolveShavingHorseTriggerIfPresent(session, session.takeAction(0, 'forest'))
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options).toHaveLength(2)
    // player resources not yet charged
    expect(resp.state.players[0]!.resources.wood).toBe(5)
    expect(resp.state.players[0]!.resources.food).toBe(0)

    // Accept (first option is the action node; '__skip__' is the decline option)
    const acceptOption = (resp.interaction.request.options ?? []).find((o) => o.value !== '__skip__')!
    const resp2 = session.resolveChoice(0, acceptOption.value)
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(4)
    expect(resp2.state.players[0]!.resources.food).toBe(3)
  })

  it('decline option keeps wood and grants no food', () => {
    const session = setup({ forestWood: 3, playerWood: 2 })
    const resp = resolveShavingHorseTriggerIfPresent(session, session.takeAction(0, 'forest'))
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const resp2 = session.resolveChoice(0, '__skip__')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(5)
    expect(resp2.state.players[0]!.resources.food).toBe(0)
  })

  it('forces mandatory exchange when wood reaches 7', () => {
    const session = setup({ forestWood: 3, playerWood: 4 }) // after collect: 7
    const resp = resolveShavingHorseTriggerIfPresent(session, session.takeAction(0, 'forest'))
    expect(resp.ok).toBe(true)
    // No choice prompt — mandatory flow runs through automatically
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(6)
    expect(resp.state.players[0]!.resources.food).toBe(3)
  })

  it('uses resource.moved events to offer exchange even without result gains', () => {
    const { session: ruleSession1, context: ctx } = directContext('gain', [moved()])
    ctx.result = { type: 'ok' }

    const result = ruleSession1.withCtx(() => executeCardListener(AFTER_OBTAIN, ctx))

    expect(result?.flow?.type).toBe('seq')
    expect(result?.flow?.optional).toBe(true)
  })

  it('uses resource.exchanged events to offer exchange even without result gains', () => {
    const { session: ruleSession2, context: ctx } = directContext('exchange', [exchanged()])
    ctx.result = { type: 'ok' }

    const result = ruleSession2.withCtx(() => executeCardListener(AFTER_EXCHANGE, ctx))

    expect(result?.flow?.type).toBe('seq')
    expect(result?.flow?.optional).toBe(true)
  })

  it('does not trigger without a current wood event even when result reports wood', () => {
    const { session: ruleSession3, context: ctx } = directContext('gain', [])

    const result = ruleSession3.withCtx(() => executeCardListener(AFTER_OBTAIN, ctx))

    expect(result).toBeUndefined()
  })

  it('has cost { wood: 1 } aligned with the reference', async () => {
    const mod = await import('../../shared/cards/A/A048_ShavingHorse')
    expect(mod.A048_ShavingHorse.cost).toEqual({ wood: 1 })
  })

  it('triggers once after a batched future receive adds wood', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    const playerA = state.players[0]!
    const playerB = state.players[1]!
    playerA.startPlayer = true
    playerA.minorPlayed.push(CARD_ID)
    playerA.resources.wood = 4
    setActiveWorkerCount(playerB, 0)
    state.futureMeeples = [
      {
        id: 'future-a48-wood',
        cardId: 'X_FutureWood',
        playerId: playerA.id,
        round: 2,
        actionId: null,
        resources: { wood: 1 },
      },
      {
        id: 'future-a48-clay',
        cardId: 'X_FutureClay',
        playerId: playerA.id,
        round: 2,
        actionId: null,
        resources: { clay: 1 },
      },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.state.players[0]!.resources.wood).toBe(5)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe(CARD_ID)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.options : [])
      .toHaveLength(2)
  })
})

describe('A048_ShavingHorse session', () => {
  const CARD_ID = 'A048_ShavingHorse'

  type SetupOptions = {
    forestWood?: number
    playerWood?: number
    playerFood?: number
    cardPlayed?: boolean
  }

  const setup = (options: SetupOptions = {}) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    if (options.cardPlayed !== false) {
      player.minorPlayed.push(CARD_ID)
    }
    player.resources.wood = options.playerWood ?? 0
    player.resources.food = options.playerFood ?? 0

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    forest.resources.wood = options.forestWood ?? 3

    session.loadState(state)
    return session
  }

  const resolveShavingHorseTriggerIfPresent = (
    session: GameSession,
    resp: ReturnType<GameSession['takeAction']>,
  ) => {
    if (resp.interaction.stateId !== 'wait') return resp
    if (resp.interaction.request.kind !== 'select-trigger') return resp
    const option = resp.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    expect(option).toBeDefined()
    return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
  }

  it('A048 S1: paying one wood plays Shaving Horse', () => {
    const session = new GameSession(6048, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.resources.wood = 1
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok, resp.error).toBe(true)
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)
      && resp.interaction.stateId === 'wait'
      && !resp.interaction.request.options?.some((option) => option.value === CARD_ID)) {
      const enter = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
      if (enter) resp = session.resolveChoice(0, enter.value)
    }
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)) {
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const card = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(card).toBeDefined()
      resp = session.resolveChoice(0, card!.value)
    }

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('A048 S5a: no Shaving Horse in play means obtaining wood triggers no exchange', () => {
    const session = setup({ forestWood: 3, playerWood: 4, cardPlayed: false })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(7)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('A048 S5b: obtaining wood but remaining below five wood triggers no exchange', () => {
    const session = setup({ forestWood: 3, playerWood: 1 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('A048 S5c: having six wood does not authorize an empty Forest', () => {
    const session = setup({ forestWood: 0, playerWood: 6 })
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(false)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources.wood).toBe(6)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.actionSpaces.find(space => space.id === 'forest')!.takenBy).toEqual([])
  })

  it('A048 S2: obtaining wood and reaching five wood may exchange one wood for three food', () => {
    const session = setup({ forestWood: 3, playerWood: 2 }) // after collect: 5
    const resp = resolveShavingHorseTriggerIfPresent(session, session.takeAction(0, 'forest'))
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options).toHaveLength(2)

    expect(resp.state.players[0]!.resources.wood).toBe(5)
    expect(resp.state.players[0]!.resources.food).toBe(0)

    const acceptOption = (resp.interaction.request.options ?? []).find((o) => o.value !== '__skip__')!
    const resp2 = session.resolveChoice(0, acceptOption.value)
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(4)
    expect(resp2.state.players[0]!.resources.food).toBe(3)
  })

  it('A048 S3: the five-wood exchange may be declined', () => {
    const session = setup({ forestWood: 3, playerWood: 2 })
    const resp = resolveShavingHorseTriggerIfPresent(session, session.takeAction(0, 'forest'))
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const resp2 = session.resolveChoice(0, '__skip__')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(5)
    expect(resp2.state.players[0]!.resources.food).toBe(0)
  })

  it('A048 S4: reaching seven wood makes the exchange mandatory', () => {
    const session = setup({ forestWood: 3, playerWood: 4 }) // after collect: 7
    const resp = resolveShavingHorseTriggerIfPresent(session, session.takeAction(0, 'forest'))
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(6)
    expect(resp.state.players[0]!.resources.food).toBe(3)
  })
})

describe('ae-negative-08-fields', () => {
  const { HORSE, BASE, sessions, ok, setup, options, choose, buy, deny, turn, cardFlow, goods, forest } = audit08Fields
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A048 N1 actual printed one wood purchase cannot trigger without obtained wood', () => { deny(setup(HORSE), HORSE); const r = buy(setup(HORSE, { resources: { wood: 7 } }), HORSE); assert.deepEqual(goods(r), [6, 40]) })
  it('A048 N2 actual Forest reaches four five six with optional accept and decline', () => {
   const low = forest(1); assert.deepEqual(goods(turn(low, 0, 'forest')), [4, 40])
   for (const initial of [2, 3]) for (const accept of [true, false]) { const s = forest(initial); const r = cardFlow(s, turn(s, 0, 'forest'), HORSE, accept); assert.deepEqual(goods(r), [initial + 3 - Number(accept), 40 + 3 * Number(accept)]) }
  })
  it('A048 N3 reaching seven and eight automatically exchanges exactly one wood', () => { for (const initial of [4, 5]) { const s = forest(initial); const r = cardFlow(s, turn(s, 0, 'forest'), HORSE); assert.deepEqual(goods(r), [initial + 2, 43]); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') } })
  it('A048 N4 one large ten wood obtain causes only one exchange', () => { const s = forest(0, 10); assert.deepEqual(goods(cardFlow(s, turn(s, 0, 'forest'), HORSE)), [9, 43]) })
  it('A048 N5 large owner stock without new wood and opponent wood do not trigger', () => { const s = forest(8); let r = turn(s, 0, 'grain-seeds'); assert.deepEqual(goods(r), [8, 40]); r = turn(s, 1, 'forest'); assert.deepEqual(goods(r), [8, 40]); assert.equal(r.state.players[1]!.resources.wood, 3) })
  it('A048 N6 real Baseboards purchase wood gain triggers away from accumulation space', () => { const s = setup(BASE, { resources: { wood: 5 } }, state => { state.players[0]!.minorPlayed = [HORSE] }); const r = cardFlow(s, buy(s, BASE), HORSE); assert.deepEqual(goods(r), [6, 41]); assert.ok(!r.state.players[0]!.minorHand.includes(BASE)) })
  it('A048 N7 actual fencing wood payment cannot trigger or recurse', () => { const s = forest(9); const r = turn(s, 0, 'fencing'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select'); const after = ok(s.commitSelectionChoice(0, { edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'] })); assert.deepEqual(goods(after), [5, 40]); assert.equal(after.state.players[0]!.fenceSegments.length, 4) })
  it('A048 N8 invalid wrong actor stale exchange and whole obtain undo allow one retry', () => {
   const s = forest(2); const before = undoRuleSnapshot(s.getState()); let r = turn(s, 0, 'forest'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') r = choose(s, r, o => o.value === HORSE)
   const choice = options(r).find(o => o.value !== '__skip__'); assert.ok(choice); assertRejectedUnchanged(s, () => s.resolveChoice(1, choice.value)); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'invalid-horse-exchange')); r = ok(s.resolveChoice(0, choice.value)); assert.deepEqual(goods(r), [4, 43]); assertRejectedUnchanged(s, () => s.resolveChoice(0, choice.value)); assertUndoRestored(before, s.undoAction()); assert.deepEqual(goods(cardFlow(s, turn(s, 0, 'forest'), HORSE)), [4, 43])
  })
})
