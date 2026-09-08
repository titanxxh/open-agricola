import type { EngineTree } from './tree'
import type { ActionRegistry } from './registry'
import type { HookDispatcher } from './dispatcher'
import type { LogStore } from './log-store'
import type { EventStore } from '../events/store'
import type { ActionExecutionResult } from '../contract/types'
import type { GameEvent } from '../contract/events'

/**
 * S4c PR5 — mutable snapshot of `Engine`'s core fields, passed to
 * module-private functions in `engine-utils.ts` / `engine-proceed.ts` /
 * `engine-resolve.ts` so they can operate without `this` access.
 *
 * `counterRef` and `pendingNodeIdRef` are boxed (`{ value: T }`) so primitive
 * mutations performed inside the extracted functions propagate back to the
 * `Engine` instance (module functions can't mutate primitives by reference).
 *
 * Obtain one via `engine._internals()`. Not part of the public Engine API.
 */
export interface EngineInternals {
  tree: EngineTree
  registry: ActionRegistry
  hooks: HookDispatcher
  log: LogStore
  events: EventStore
  eventLogDerivations: Array<{
    events: GameEvent[]
    result: ActionExecutionResult
  }>
  internalChildResults: Map<string, Record<string, ActionExecutionResult>>
  counterRef: { value: number }
  pendingNodeIdRef: { value: string | null }
}
