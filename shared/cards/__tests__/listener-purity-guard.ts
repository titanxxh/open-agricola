import {
  setCardListenerInvocationInterceptor,
  type CardListenerContext,
  type CardListenerInvocation,
  type CardListenerInvocationInterceptor,
  type CardListenerRegistration,
} from '../card-listeners'
import { getCardListenerSource } from '../card-listener-source'
import { setActionHookInvocationInterceptor, type ActionHookContext, type ActionHookResult } from '../../actions/hooks'
import type { EventQuery } from '../../events/query'

/**
 * Test-only listener purity guard.
 *
 * Installed through Vitest setup files, it wraps every card-listener
 * invocation that flows through `executeCardListener` /
 * `invokeCardCostCandidateTransform`, and `guardCardImplListeners` rewrites the
 * registered `handler` / `deriveCardCostCandidate` functions of every loaded
 * Card Impl in place so direct `registration.handler(ctx)` calls in focused
 * tests are guarded as well. The authoritative inputs listed in
 * `GUARDED_CONTEXT_KEYS` are handed to the listener as deep read-only proxies
 * (including values reached through property descriptors), and `eventQuery`
 * results are wrapped the same way: any write (assignment, delete,
 * defineProperty, array mutation, freeze) made directly, through an alias, or
 * inside a helper throws a `ListenerPurityViolationError` naming the card,
 * listener, phase and path.
 *
 * Boundaries: only executed listener branches are protected; the proxies exist
 * only for the duration of one invocation, so the flow a listener returns may
 * still mutate state later when its action leaves execute. Fresh local objects
 * created inside the listener are never wrapped and may be mutated freely.
 * Reference identity against objects captured outside the listener does not
 * hold for guarded inputs; use `resolveAuthoritative` in tests that need it.
 */

export const GUARDED_CONTEXT_KEYS = [
  'state',
  'player',
  'triggerPlayer',
  'ownerPlayer',
  'effectPlayer',
  'space',
  'actionContext',
  'params',
  'result',
  'transactionEvents',
  'actionEvents',
  'triggerSnapshot',
  'extraData',
  'costs',
  'costTrades',
  'costBonuses',
  'paymentResourceProviders',
  'costAttribution',
] as const

export type ListenerPurityViolationKind =
  | 'set'
  | 'delete'
  | 'defineProperty'
  | 'setPrototypeOf'
  | 'preventExtensions'
  | 'returned-authoritative-reference'

export type ListenerPurityViolationDetails = {
  cardId: string
  listenerId: string
  invocationKind: CardListenerInvocation['kind']
  phase: string
  actionId: string
  violationKind: ListenerPurityViolationKind
  path: string
}

const describeViolation = (kind: ListenerPurityViolationKind): string => {
  switch (kind) {
    case 'set':
      return 'assigned'
    case 'delete':
      return 'deleted'
    case 'defineProperty':
      return 'defined a property on'
    case 'setPrototypeOf':
      return 'changed the prototype of'
    case 'preventExtensions':
      return 'froze or sealed'
    case 'returned-authoritative-reference':
      return 'returned a reference to authoritative state at'
  }
}

export class ListenerPurityViolationError extends Error {
  readonly details: ListenerPurityViolationDetails

  constructor(details: ListenerPurityViolationDetails) {
    super(
      `Listener purity violation: ${details.cardId}#${details.listenerId} `
        + `(${details.invocationKind}, ${details.phase} ${details.actionId}) `
        + `${describeViolation(details.violationKind)} ${details.path}. `
        + 'Listeners must only read state and return a flow; mutate through action leaves '
        + 'such as special-effect, gain or pay, and return copies instead of live objects.',
    )
    this.name = 'ListenerPurityViolationError'
    this.details = details
  }
}

type InvocationIdentity = Pick<
  ListenerPurityViolationDetails,
  'cardId' | 'listenerId' | 'invocationKind' | 'phase' | 'actionId'
>

const proxyTargets = new WeakMap<object, object>()

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null

export const isGuardedProxy = (value: unknown): boolean => isObject(value) && proxyTargets.has(value)

/** Returns the authoritative object behind a guarded proxy, or the value itself. */
export const resolveAuthoritative = <T>(value: T): T =>
  isObject(value) ? ((proxyTargets.get(value) as T | undefined) ?? value) : value

const describeInvocation = (invocation: CardListenerInvocation): InvocationIdentity => ({
  cardId:
    getCardListenerSource(invocation.registration)
    ?? invocation.context.ownerCardId
    ?? invocation.registration.cardIds?.[0]
    ?? '<no card>',
  listenerId: invocation.registration.id,
  invocationKind: invocation.kind,
  phase: String(invocation.context.phase),
  actionId: String(invocation.context.actionId),
})

const violation = (
  identity: InvocationIdentity,
  violationKind: ListenerPurityViolationKind,
  path: string,
): ListenerPurityViolationError =>
  new ListenerPurityViolationError({ ...identity, violationKind, path })

const propertyPath = (path: string, key: PropertyKey): string =>
  typeof key === 'symbol' ? `${path}[${String(key)}]` : /^\d+$/.test(String(key)) ? `${path}[${String(key)}]` : `${path}.${String(key)}`

const createReadonlyWrapper = (identity: InvocationIdentity) => {
  const cache = new WeakMap<object, object>()
  const wrap = <T>(value: T, path: string): T => {
    if (!isObject(value) || proxyTargets.has(value)) return value
    const cached = cache.get(value)
    if (cached) return cached as T
    const proxy = new Proxy(value, {
      get(target, key, receiver) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
        if (descriptor && !descriptor.configurable && !descriptor.writable && 'value' in descriptor) {
          return descriptor.value
        }
        const next: unknown = Reflect.get(target, key, receiver)
        if (typeof next === 'function') return next
        return wrap(next, propertyPath(path, key))
      },
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key)
        if (!descriptor || !descriptor.configurable || !('value' in descriptor) || typeof descriptor.value === 'function') {
          return descriptor
        }
        return { ...descriptor, value: wrap(descriptor.value, propertyPath(path, key)) }
      },
      set(_target, key) {
        throw violation(identity, 'set', propertyPath(path, key))
      },
      deleteProperty(_target, key) {
        throw violation(identity, 'delete', propertyPath(path, key))
      },
      defineProperty(_target, key) {
        throw violation(identity, 'defineProperty', propertyPath(path, key))
      },
      setPrototypeOf() {
        throw violation(identity, 'setPrototypeOf', path)
      },
      preventExtensions() {
        throw violation(identity, 'preventExtensions', path)
      },
    })
    cache.set(value, proxy)
    proxyTargets.set(proxy, value)
    return proxy as T
  }
  return wrap
}

const assertNoAuthoritativeReferences = (
  value: unknown,
  identity: InvocationIdentity,
  path: string,
  seen: Set<object>,
): void => {
  if (!isObject(value)) return
  if (proxyTargets.has(value)) throw violation(identity, 'returned-authoritative-reference', path)
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoAuthoritativeReferences(entry, identity, `${path}[${index}]`, seen))
    return
  }
  for (const [key, entry] of Object.entries(value)) {
    assertNoAuthoritativeReferences(entry, identity, `${path}.${key}`, seen)
  }
}

type Wrapper = ReturnType<typeof createReadonlyWrapper>

/** Returns an EventQuery whose results (and predicate arguments) are guarded proxies of the frame events. */
const guardEventQuery = (query: EventQuery, wrap: Wrapper, path: string): EventQuery => {
  const guardPredicate = <E>(predicate: ((event: E) => boolean) | undefined, method: string) =>
    predicate ? (event: E) => predicate(wrap(event, `${path}.${method}()`)) : undefined
  return {
    has: (type, predicate) => query.has(type, guardPredicate(predicate, 'has')),
    find: (type, predicate) => wrap(query.find(type, guardPredicate(predicate, 'find')), `${path}.find()`),
    filter: (type, predicate) =>
      query.filter(type, guardPredicate(predicate, 'filter')).map((event) => wrap(event, `${path}.filter()`)),
  } as EventQuery
}

export const listenerPurityInterceptor: CardListenerInvocationInterceptor = (invocation, invoke) => {
  // Already guarded by an enclosing invocation (nested executeCardListener, or a
  // handler rewritten in place and then dispatched through executeCardListener).
  if (isGuardedProxy(invocation.context.state)) return invoke(invocation.context)
  const identity = describeInvocation(invocation)
  const wrap = createReadonlyWrapper(identity)
  const guarded: Record<string, unknown> = { ...invocation.context }
  for (const key of GUARDED_CONTEXT_KEYS) {
    if (isObject(guarded[key])) guarded[key] = wrap(guarded[key], key)
  }
  if (invocation.context.eventQuery) {
    guarded.eventQuery = guardEventQuery(invocation.context.eventQuery, wrap, 'eventQuery')
  }
  const result = invoke(guarded as unknown as CardListenerContext)
  assertNoAuthoritativeReferences(
    result,
    identity,
    invocation.kind === 'handler' ? 'result' : 'candidate',
    new Set(),
  )
  return result
}

/** Installs the guard on every card-listener invocation; returns an uninstall function. */
export const installListenerPurityGuard = (): (() => void) => {
  setCardListenerInvocationInterceptor(listenerPurityInterceptor)
  setActionHookInvocationInterceptor((registration, context, invoke) => {
    if (context.phase !== 'computeCosts') return invoke(context)
    return listenerPurityInterceptor({
      kind: 'handler',
      registration: { id: registration.id, cardIds: ['<action hook>'] },
      context,
    }, guarded => invoke(guarded as ActionHookContext))
  })
  return () => {
    setCardListenerInvocationInterceptor(undefined)
    setActionHookInvocationInterceptor(undefined)
  }
}

/**
 * Invokes a listener handler directly under the purity guard, for focused
 * listener tests that build their own `CardListenerContext` instead of going
 * through `executeCardListener`.
 */
export const invokeListenerHandlerUnderGuard = (
  registration: CardListenerRegistration,
  context: CardListenerContext,
): ActionHookResult | void => {
  const handler = registration.handler
  if (!handler) return undefined
  return listenerPurityInterceptor({ kind: 'handler', registration, context }, (guardedContext) => handler(guardedContext))
}

/** Returns a view of `registration` whose `handler` always runs under the purity guard. */
export const guardedListener = (registration: CardListenerRegistration): CardListenerRegistration =>
  registration.handler
    ? { ...registration, handler: (context) => invokeListenerHandlerUnderGuard(registration, context) }
    : registration

const guardedInPlace = new WeakSet<CardListenerRegistration>()

export const isListenerGuardedInPlace = (registration: CardListenerRegistration): boolean =>
  guardedInPlace.has(registration)

/**
 * Rewrites `handler` and `deriveCardCostCandidate` on the registration itself so
 * that direct calls such as `impl.listeners[0].handler(ctx)` in focused tests run
 * under the guard without routing through `executeCardListener`.
 */
export const guardListenerRegistrationInPlace = (registration: CardListenerRegistration): void => {
  if (guardedInPlace.has(registration)) return
  guardedInPlace.add(registration)
  const handler = registration.handler
  if (handler) {
    registration.handler = (context) =>
      listenerPurityInterceptor({ kind: 'handler', registration, context }, (guardedContext) => handler(guardedContext))
  }
  const derive = registration.deriveCardCostCandidate
  if (derive) {
    registration.deriveCardCostCandidate = (context, candidate) =>
      listenerPurityInterceptor(
        { kind: 'deriveCardCostCandidate', registration, context, candidate },
        (guardedContext) => derive(guardedContext, candidate),
      )
  }
}

/** Guards every listener of every loaded Card Impl in place (used by the register-all test setup). */
export const guardCardImplListeners = (
  impls: Record<string, { listeners?: readonly CardListenerRegistration[] }>,
): number => {
  let guarded = 0
  for (const impl of Object.values(impls)) {
    for (const listener of impl.listeners ?? []) {
      guardListenerRegistrationInPlace(listener)
      guarded += 1
    }
  }
  return guarded
}
