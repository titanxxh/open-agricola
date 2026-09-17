import { afterEach, describe, expect, it } from 'vitest'
import type { ActionFlow, CardCostCandidate, GameState, PlayerState } from '../../contract/types'
import {
  executeCardListener,
  invokeCardCostCandidateTransform,
  setCardListenerInvocationInterceptor,
  type CardListenerContext,
  type CardListenerRegistration,
} from '../card-listeners'
import { incCounter } from '../__stubs__/helpers'
import { ALL_CARD_IMPLS } from '../register-all'
import { createEventQuery } from '../../events/query'
import { B048_ForestStone_impl } from '../B/B048_ForestStone'
import {
  ListenerPurityViolationError,
  guardListenerRegistrationInPlace,
  installListenerPurityGuard,
  invokeListenerHandlerUnderGuard,
  isGuardedProxy,
  isListenerGuardedInPlace,
  listenerPurityInterceptor,
  resolveAuthoritative,
} from './listener-purity-guard'

const CARD_ID = 'TEST_PurityGuardCard'

const makePlayer = (id: string): PlayerState =>
  ({
    id,
    name: id,
    resources: { wood: 2, clay: 0, reed: 0, stone: 0, food: 3, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    cardStates: { [CARD_ID]: { counters: { seen: 1 }, extraData: { list: [{ spaceId: 'forest' }, { spaceId: 'clay-pit' }] }, stack: ['a', 'b'] } },
    improvements: [],
    minorPlayed: [CARD_ID],
    occupationPlayed: [],
  }) as unknown as PlayerState

const makeContext = (overrides: Partial<CardListenerContext> = {}): { context: CardListenerContext; state: GameState; player: PlayerState } => {
  const player = makePlayer('p1')
  const opponent = makePlayer('p2')
  const space = { id: 'forest', resources: { wood: 3 } } as unknown as CardListenerContext['space']
  const state = { players: [player, opponent], actionSpaces: [space], round: 3 } as unknown as GameState
  return {
    state,
    player,
    context: {
      state,
      player,
      triggerPlayer: player,
      ownerPlayer: player,
      effectPlayer: player,
      space,
      actionId: 'place-farmer',
      phase: 'after',
      actionContext: { targetSpaceId: 'forest' },
      params: { count: 1 },
      transactionEvents: [],
      eventQuery: { all: () => [] } as unknown as CardListenerContext['eventQuery'],
      ...overrides,
    },
  }
}

const registration = (handler: CardListenerRegistration['handler'], id = 'purity-guard-test-listener'): CardListenerRegistration => ({
  id,
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['place-farmer'],
  handler,
})

const expectViolation = (run: () => unknown, expected: { kind: string; path: string }) => {
  let caught: unknown
  try {
    run()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(ListenerPurityViolationError)
  const violation = caught as ListenerPurityViolationError
  expect(violation.details).toMatchObject({
    cardId: CARD_ID,
    listenerId: 'purity-guard-test-listener',
    phase: 'after',
    actionId: 'place-farmer',
    violationKind: expected.kind,
    path: expected.path,
  })
  expect(violation.message).toContain(CARD_ID)
  expect(violation.message).toContain('purity-guard-test-listener')
  expect(violation.message).toContain(expected.path)
  return violation
}

describe('listener purity guard: rejected writes', () => {
  afterEach(() => {
    installListenerPurityGuard()
  })

  it('is installed globally by the test setup so executeCardListener is guarded', () => {
    const { context, player } = makeContext()
    const listener = registration((ctx) => {
      ctx.player.resources.wood += 1
    })

    expectViolation(() => executeCardListener(listener, context), { kind: 'set', path: 'player.resources.wood' })
    expect(player.resources.wood).toBe(2)
  })

  it('rejects a direct resource write and leaves the authoritative value untouched', () => {
    const { context, player } = makeContext()
    const listener = registration((ctx) => {
      ctx.player.resources.food = 0
    })

    expectViolation(() => invokeListenerHandlerUnderGuard(listener, context), { kind: 'set', path: 'player.resources.food' })
    expect(player.resources.food).toBe(3)
  })

  it('rejects a deep cardStates write', () => {
    const { context, player } = makeContext()
    const listener = registration((ctx) => {
      ctx.player.cardStates![CARD_ID]!.counters!.seen = 5
    })

    expectViolation(() => invokeListenerHandlerUnderGuard(listener, context), {
      kind: 'set',
      path: `player.cardStates.${CARD_ID}.counters.seen`,
    })
    expect(player.cardStates![CARD_ID]!.counters!.seen).toBe(1)
  })

  it('rejects array mutation through push, splice and sort', () => {
    const { context: pushContext } = makeContext()
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => { ctx.state.players[1]!.minorPlayed.push('X') }), pushContext),
      { kind: 'set', path: 'state.players[1].minorPlayed[1]' },
    )

    const { context: spliceContext, player } = makeContext()
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => { (ctx.player.cardStates![CARD_ID]!.stack as string[]).splice(0, 1) }), spliceContext),
      { kind: 'set', path: `player.cardStates.${CARD_ID}.stack[0]` },
    )
    expect(player.cardStates![CARD_ID]!.stack).toEqual(['a', 'b'])

    const { context: sortContext } = makeContext()
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => { (ctx.player.cardStates![CARD_ID]!.stack as string[]).sort().reverse() }), sortContext),
      { kind: 'set', path: `player.cardStates.${CARD_ID}.stack[0]` },
    )
  })

  it('rejects writes through a local alias and through the owner/effect player references', () => {
    const { context } = makeContext()
    // ownerPlayer is the same object as player here, so the shared proxy keeps the first path it was reached by.
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => {
        const owner = ctx.ownerPlayer ?? ctx.player
        owner.resources.clay = 9
      }), context),
      { kind: 'set', path: 'player.resources.clay' },
    )
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => {
        const target = ctx.state.players.find((entry) => entry.id === 'p2')!
        target.resources.reed = 1
      }), context),
      { kind: 'set', path: 'state.players[1].resources.reed' },
    )
  })

  it('rejects writes hidden inside a helper', () => {
    const { context, player } = makeContext()
    const listener = registration((ctx) => {
      incCounter(ctx.player, CARD_ID, 'observedCount')
    })

    expectViolation(() => invokeListenerHandlerUnderGuard(listener, context), {
      kind: 'set',
      path: `player.cardStates.${CARD_ID}.counters.observedCount`,
    })
    expect(player.cardStates![CARD_ID]!.counters).toEqual({ seen: 1 })
  })

  it('rejects delete, defineProperty and freeze on authoritative objects', () => {
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => { delete ctx.player.cardStates![CARD_ID] }), makeContext().context),
      { kind: 'delete', path: `player.cardStates.${CARD_ID}` },
    )
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => { Object.defineProperty(ctx.space, 'taken', { value: true }) }), makeContext().context),
      { kind: 'defineProperty', path: 'space.taken' },
    )
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => { Object.freeze(ctx.player.resources) }), makeContext().context),
      { kind: 'preventExtensions', path: 'player.resources' },
    )
  })

  it('rejects writes to the engine action context and to the triggering space', () => {
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => { ctx.actionContext!.skipBeforeTriggers = true }), makeContext().context),
      { kind: 'set', path: 'actionContext.skipBeforeTriggers' },
    )
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => { ctx.space.resources!.wood = 0 }), makeContext().context),
      { kind: 'set', path: 'space.resources.wood' },
    )
  })

  it('rejects a returned flow that carries live authoritative objects', () => {
    const { context } = makeContext()
    const listener = registration((ctx) => ({
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'list', value: ctx.player.cardStates![CARD_ID]!.extraData!.list },
      },
    }))

    expectViolation(() => invokeListenerHandlerUnderGuard(listener, context), {
      kind: 'returned-authoritative-reference',
      path: 'result.flow.params.value',
    })
  })

  it('guards events reached through eventQuery and rejects returning them', () => {
    const event = { type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain' }
    const transactionEvents = [event] as unknown as CardListenerContext['transactionEvents']
    const eventQuery = createEventQuery(transactionEvents)

    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => {
        const moved = ctx.eventQuery.find('resource.moved')!
        ;(moved as { resources: Record<string, number> }).resources.wood = 5
      }), makeContext({ transactionEvents, eventQuery }).context),
      { kind: 'set', path: 'eventQuery.find().resources.wood' },
    )
    expect(event.resources.wood).toBe(1)

    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => {
        ctx.eventQuery.filter('resource.moved', (entry) => {
          ;(entry as unknown as { reason: string }).reason = 'stolen'
          return true
        })
      }), makeContext({ transactionEvents, eventQuery }).context),
      { kind: 'set', path: 'eventQuery.filter().reason' },
    )

    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => ({
        extraData: { moved: ctx.eventQuery.filter('resource.moved') },
      })), makeContext({ transactionEvents, eventQuery }).context),
      { kind: 'returned-authoritative-reference', path: 'result.extraData.moved[0]' },
    )
  })

  it('wraps values reached through property descriptors', () => {
    const { context, state } = makeContext()
    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => {
        const players = Object.getOwnPropertyDescriptor(ctx.state, 'players')!.value as PlayerState[]
        players.push(makePlayer('p3'))
      }), context),
      { kind: 'set', path: 'state.players[2]' },
    )
    expect(state.players).toHaveLength(2)

    expectViolation(
      () => invokeListenerHandlerUnderGuard(registration((ctx) => ({
        extraData: { resources: Object.getOwnPropertyDescriptors(ctx.player).resources!.value },
      })), makeContext().context),
      { kind: 'returned-authoritative-reference', path: 'result.extraData.resources' },
    )
  })

  it('guards registrations rewritten in place so direct handler calls are covered', () => {
    const { context, player } = makeContext()
    const direct = registration((ctx) => {
      ctx.player.resources.wood += 1
    })
    guardListenerRegistrationInPlace(direct)

    expect(isListenerGuardedInPlace(direct)).toBe(true)
    expectViolation(() => direct.handler!(context), { kind: 'set', path: 'player.resources.wood' })
    expect(player.resources.wood).toBe(2)
    // Dispatching the rewritten handler through executeCardListener guards it exactly once.
    expectViolation(() => executeCardListener(direct, context), { kind: 'set', path: 'player.resources.wood' })
  })

  it('has every loaded Card Impl listener guarded in place by the test setup', () => {
    const listeners = Object.values(ALL_CARD_IMPLS).flatMap((impl) => impl.listeners ?? [])
    expect(listeners.length).toBeGreaterThan(600)
    expect(listeners.every((listener) => isListenerGuardedInPlace(listener))).toBe(true)

    const forestStone = B048_ForestStone_impl.listeners![0]!
    const owner = makePlayer('p1')
    owner.cardStates = { B048_ForestStone: { extraData: { foodCount: 2 } } } as PlayerState['cardStates']
    const space = { id: 'forest', gainPerRound: { wood: 3 } } as unknown as CardListenerContext['space']
    const ctx = {
      state: { players: [owner], actionSpaces: [space] } as unknown as GameState,
      player: owner,
      triggerPlayer: owner,
      ownerPlayer: owner,
      effectPlayer: owner,
      space,
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { wood: 3 } },
      transactionEvents: [],
      eventQuery: { all: () => [] } as unknown as CardListenerContext['eventQuery'],
    } as CardListenerContext
    const before = JSON.stringify(owner)

    const result = forestStone.handler!(ctx)

    expect(result?.flow).toBeDefined()
    expect(JSON.stringify(owner)).toBe(before)
  })

  it('guards deriveCardCostCandidate transforms too', () => {
    const { context } = makeContext({ phase: 'computeCosts', actionId: 'minor-improvement' })
    const listener: CardListenerRegistration = {
      id: 'purity-guard-test-listener',
      cardIds: [CARD_ID],
      phases: ['computeCosts'],
      deriveCardCostCandidate: (ctx, candidate) => {
        ctx.player.resources.wood -= 1
        return candidate
      },
    }
    const candidate = { resources: { wood: 1 } } as unknown as CardCostCandidate

    let caught: unknown
    try {
      invokeCardCostCandidateTransform(listener, context, candidate)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ListenerPurityViolationError)
    expect((caught as ListenerPurityViolationError).details).toMatchObject({
      invocationKind: 'deriveCardCostCandidate',
      phase: 'computeCosts',
      actionId: 'minor-improvement',
      violationKind: 'set',
      path: 'player.resources.wood',
    })
  })
})

describe('listener purity guard: accepted pure listeners', () => {
  it('lets a listener read state and return a pure query result', () => {
    const { context } = makeContext({ phase: 'computeCosts', actionId: 'construct' })
    const listener = registration((ctx) => {
      const rooms = ctx.state.players.filter((entry) => entry.resources.wood > 0).length
      return rooms > 0 ? { costs: { wood: -1 } } : undefined
    })

    expect(invokeListenerHandlerUnderGuard(listener, context)).toEqual({ costs: { wood: -1 } })
  })

  it('lets a listener return nothing when it does not trigger', () => {
    const { context } = makeContext()
    const listener = registration((ctx) => {
      if (ctx.space.id !== 'clay-pit') return
      return { flow: { type: 'leaf', actionId: 'gain', params: { clay: 1 } } }
    })

    expect(invokeListenerHandlerUnderGuard(listener, context)).toBeUndefined()
  })

  it('lets a listener build a flow from copies and mutate its own local objects', () => {
    const { context, player } = makeContext()
    const before = JSON.stringify(player)
    const listener = registration((ctx) => {
      const cardState = ctx.player.cardStates![CARD_ID]!
      const stack = [...(cardState.stack as string[])]
      const popped = stack.pop()
      const remaining = (cardState.extraData!.list as Array<{ spaceId: string }>)
        .filter((entry) => entry.spaceId !== ctx.space.id)
        .map((entry) => ({ ...entry }))
      const next = { ...cardState.counters, seen: (cardState.counters!.seen ?? 0) + 1 }
      next.seen += 1
      const flow: ActionFlow = {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-counter', key: 'seen', value: next.seen } },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-extra-data', key: 'list', value: remaining } },
          { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, params: { [popped!]: 1 } },
        ],
      }
      return { flow, sourceCard: CARD_ID }
    })

    const result = invokeListenerHandlerUnderGuard(listener, context)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-counter', key: 'seen', value: 3 } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-extra-data', key: 'list', value: [{ spaceId: 'clay-pit' }] } },
        { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, params: { b: 1 } },
      ],
    })
    expect(isGuardedProxy((result!.flow as { children: ActionFlow[] }).children[1]!.params!.value)).toBe(false)
    expect(JSON.stringify(player)).toBe(before)
  })

  it('keeps identity between context references and the state they came from', () => {
    const { context, state } = makeContext()
    const listener = registration((ctx) => ({
      extraData: {
        samePlayer: ctx.state.players[0] === ctx.player,
        sameOwner: ctx.ownerPlayer === ctx.effectPlayer,
        sameSpace: ctx.state.actionSpaces[0] === ctx.space,
        serialized: JSON.stringify(ctx.state.players.map((entry) => entry.id)),
        authoritativeState: resolveAuthoritative(ctx.state) === state,
        guarded: isGuardedProxy(ctx.state),
      },
    }))

    expect(invokeListenerHandlerUnderGuard(listener, context)?.extraData).toEqual({
      samePlayer: true,
      sameOwner: true,
      sameSpace: true,
      serialized: '["p1","p2"]',
      authoritativeState: true,
      guarded: true,
    })
  })

  it('does not wrap a nested listener invocation twice and attributes it to the outer listener', () => {
    const { context } = makeContext()
    const inner = registration((ctx) => {
      ctx.player.resources.stone = 1
    }, 'inner-listener')
    const outer = registration((ctx) => executeCardListener(inner, ctx))

    const violation = expectViolation(() => invokeListenerHandlerUnderGuard(outer, context), { kind: 'set', path: 'player.resources.stone' })
    expect(violation.details.listenerId).toBe('purity-guard-test-listener')
  })

  it('leaves listener invocations untouched once uninstalled', () => {
    const uninstall = installListenerPurityGuard()
    uninstall()
    try {
      const { context, player } = makeContext()
      const listener = registration((ctx) => {
        ctx.player.resources.wood += 1
      })
      expect(() => executeCardListener(listener, context)).not.toThrow()
      expect(player.resources.wood).toBe(3)
    } finally {
      setCardListenerInvocationInterceptor(listenerPurityInterceptor)
    }
  })
})
