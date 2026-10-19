import type { ActionHookPhase } from '../actions/hooks'
import type { CardListenerRegistration } from './card-listeners'
import { getCardListenerSource, setCardListenerSource } from './card-listener-source'

const actionPhases = ['before', 'immediatelyAfter', 'after', 'computeCosts', 'computeArgs', 'computeChoiceCandidates', 'computeReplace', 'isDoable'] as const
const spacePhases = ['before', 'computeReplace', 'isDoable'] as const

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
  'black-market': ['before', 'after'],
  'cut-peat': ['before', 'after'],
  'fell-trees': ['before', 'after'],
  'hiring-fair': ['before', 'after'],
  'horse-market': ['before', 'after'],
  'illicit-work': ['before', 'after'],
  'slash-and-burn': ['before', 'after'],
  // Existing specific-space callers remain in scope until #1292 migrates their selectors.
  'cattle-market': spacePhases,
  'pig-market': spacePhases,
  'sheep-market': spacePhases,
  'copse-56': spacePhases,
  cultivation: spacePhases,
  farmland: spacePhases,
  fishing: spacePhases,
  'grain-utilization': spacePhases,
  'house-building-56': spacePhases,
  lessons: spacePhases,
  'lessons-3': spacePhases,
  'lessons-4': spacePhases,
  'lessons-56-2f': spacePhases,
  'lessons-56-variable': spacePhases,
  'meeting-place': spacePhases,
  'modest-wish-children-56': spacePhases,
  'traveling-players-56': spacePhases,
  fencing: ['immediatelyAfter'],
  'wish-children': ['before', 'after', 'computeReplace', 'isDoable'],
} as const satisfies Record<string, readonly ActionHookPhase[]>

export type CardListenerAction = keyof typeof listenerActionContract
for (const phases of Object.values(listenerActionContract)) Object.freeze(phases)
Object.freeze(listenerActionContract)
export const isCardListenerAction = (target: unknown): target is CardListenerAction =>
  typeof target === 'string' && Object.hasOwn(listenerActionContract, target)

export const listenerEventContract = [
  'farm.animalMoved', 'farm.sown', 'farm.cropAdded', 'resource.moved',
  'farm.fieldPlowed', 'farm.roomBuilt', 'farm.stableBuilt', 'farm.fenceBuilt', 'farm.spacesUsed',
  'worker.useCompleted', 'farm.terrainChanged',
  'anytime.completed',
] as const
Object.freeze(listenerEventContract)
export type CardListenerEvent = typeof listenerEventContract[number]

type ListenerFilters = {
  id?: unknown
  actions?: readonly unknown[]
  events?: readonly unknown[]
  phases?: readonly unknown[]
  globalQuery?: unknown
}

export function listenerContractError(listener: ListenerFilters): string | undefined {
  const fail = (reason: string) => `Listener ${String(listener.id ?? '<unnamed>')}: ${reason}`
  const phases = listener.phases
  if (!Array.isArray(phases) || phases.length === 0) return fail('explicit nonempty phases are required')
  const selectors = Number(listener.actions !== undefined) + Number(listener.events !== undefined) + Number(listener.globalQuery !== undefined)
  if (selectors !== 1) return fail('declare exactly one actions, events or globalQuery selector')
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
  const snapshot: CardListenerRegistration = {
    ...listener,
    ...(listener.cardIds ? { cardIds: [...listener.cardIds] } : {}),
    ...(listener.actions ? { actions: [...listener.actions] } : {}),
    ...(listener.events ? { events: [...listener.events] } : {}),
    ...(listener.phases ? { phases: [...listener.phases] } : {}),
    ...(listener.zones ? { zones: [...listener.zones] } : {}),
    ...(listener.blockedAnytimeInteractionKinds ? { blockedAnytimeInteractionKinds: [...listener.blockedAnytimeInteractionKinds] } : {}),
  }
  for (const value of Object.values(snapshot)) if (Array.isArray(value)) Object.freeze(value)
  const owner = sourceCard ?? getCardListenerSource(listener)
  if (owner) setCardListenerSource(snapshot, owner)
  return Object.freeze(snapshot)
}
