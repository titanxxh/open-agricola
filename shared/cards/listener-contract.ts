import type { ActionHookPhase } from '../actions/hooks'
import type { GameEvent } from '../contract/events'
import type { CardListenerRegistration } from './card-listeners'
import { getCardListenerSource, setCardListenerSource } from './card-listener-source'

const actionPhases = ['before', 'immediatelyAfter', 'after', 'computeCosts', 'computeArgs', 'computeChoiceCandidates', 'computeReplace', 'isDoable'] as const
export const actionSpaceListenerPhases = ['before', 'immediatelyAfter', 'after', 'computeReplace', 'isDoable'] as const
export type ActionSpaceListenerPhase = typeof actionSpaceListenerPhases[number]

/** Subscription permission is deliberate; registering an executable action does not grant it. */
export const listenerActionContract = {
  collect: actionPhases,
  gain: actionPhases,
  receive: actionPhases,
  plow: actionPhases,
  sow: actionPhases,
  construct: actionPhases,
  'renovate-house': actionPhases,
  fence: actionPhases,
  stables: actionPhases,
  improvement: actionPhases,
  occupation: actionPhases,
  'family-growth': actionPhases,
  'bake-bread': actionPhases,
  breed: actionPhases,
  reap: actionPhases,
  exchange: actionPhases,
  reorganize: actionPhases,
  pay: actionPhases,
  'pass-minor-card-to-left': ['after'],
  'place-farmer': ['before', 'after', 'computeArgs'],
  'trade-applied': ['immediatelyAfter'],
  anytime: ['anytime'],
  'compute-exchanges': ['computeExchanges'],
  'moor-action': ['before', 'after'],
} as const satisfies Record<string, readonly ActionHookPhase[]>

export type CardListenerAction = keyof typeof listenerActionContract
for (const phases of Object.values(listenerActionContract)) Object.freeze(phases)
Object.freeze(listenerActionContract)
Object.freeze(actionSpaceListenerPhases)
export const isCardListenerAction = (target: unknown): target is CardListenerAction =>
  typeof target === 'string' && Object.hasOwn(listenerActionContract, target)

export const listenerEventContract = [
  'farm.animalMoved', 'farm.sown', 'farm.cropAdded', 'resource.moved',
  'farm.fieldPlowed', 'farm.roomBuilt', 'farm.stableBuilt', 'farm.fenceBuilt', 'farm.spacesUsed',
  'worker.useCompleted', 'farm.terrainChanged',
  'anytime.completed',
] as const satisfies readonly GameEvent['type'][]
Object.freeze(listenerEventContract)
export type CardListenerEvent = typeof listenerEventContract[number]

type ListenerFilters = {
  id?: unknown
  actions?: unknown
  actionSpaces?: unknown
  events?: unknown
  phases?: unknown
  globalQuery?: unknown
}

export function listenerContractError(listener: ListenerFilters): string | undefined {
  const fail = (reason: string) => `Listener ${String(listener.id ?? '<unnamed>')}: ${reason}`
  const phases = listener.phases
  if (!Array.isArray(phases) || phases.length === 0) return fail('explicit nonempty phases are required')
  const selectors = [listener.actions, listener.actionSpaces, listener.events, listener.globalQuery].filter(value => value !== undefined).length
  if (selectors !== 1) return fail('declare exactly one actions, actionSpaces, events or globalQuery selector')
  if (listener.actionSpaces !== undefined) {
    if (listener.actionSpaces !== 'all' && (!Array.isArray(listener.actionSpaces) || listener.actionSpaces.length === 0
      || !listener.actionSpaces.every(id => typeof id === 'string' && id.trim().length > 0))) {
      return fail("actionSpaces requires 'all' or explicit nonempty action space IDs")
    }
    return phases.every(phase => (actionSpaceListenerPhases as readonly unknown[]).includes(phase))
      ? undefined : fail('actionSpaces only supports before, immediatelyAfter, after, computeReplace or isDoable')
  }
  if (listener.globalQuery !== undefined) {
    return listener.globalQuery === true && phases.every(phase => phase === 'isDoable')
      ? undefined : fail('globalQuery only supports isDoable')
  }
  if (listener.events !== undefined) {
    if (!Array.isArray(listener.events) || listener.events.length === 0) return fail('explicit nonempty event targets are required')
    if (!listener.events.every(event => (listenerEventContract as readonly unknown[]).includes(event))) return fail('unsupported event target')
    return phases.every(phase => phase === 'after') ? undefined : fail('event targets require after')
  }
  if (!Array.isArray(listener.actions) || listener.actions.length === 0) return fail('explicit nonempty action targets are required')
  for (const target of listener.actions) {
    if (!isCardListenerAction(target)) return fail(`unsupported action target '${String(target)}'`)
    const allowed: readonly unknown[] = listenerActionContract[target]
    if (!phases.every(phase => allowed.includes(phase))) return fail(`unsupported phase for action target '${target}'`)
  }
}

export function snapshotCardListener(listener: CardListenerRegistration, sourceCard?: string): CardListenerRegistration {
  const error = listenerContractError(listener)
  if (error) throw new Error(error)
  const snapshot: CardListenerRegistration = { ...listener }
  if (snapshot.cardIds) snapshot.cardIds = [...snapshot.cardIds]
  if (snapshot.actions) snapshot.actions = [...snapshot.actions]
  if (Array.isArray(snapshot.actionSpaces)) snapshot.actionSpaces = [...snapshot.actionSpaces]
  if (snapshot.events) snapshot.events = [...snapshot.events]
  snapshot.phases = [...snapshot.phases]
  if (snapshot.zones) snapshot.zones = [...snapshot.zones]
  if (snapshot.blockedAnytimeInteractionKinds) snapshot.blockedAnytimeInteractionKinds = [...snapshot.blockedAnytimeInteractionKinds]
  for (const value of Object.values(snapshot)) if (Array.isArray(value)) Object.freeze(value)
  const owner = sourceCard ?? getCardListenerSource(listener)
  if (owner) setCardListenerSource(snapshot, owner)
  return Object.freeze(snapshot)
}
