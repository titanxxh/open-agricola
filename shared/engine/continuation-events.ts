import type { GameEvent } from '../contract/events'
import { createEventQuery, type QueryableGameEvent } from '../events/query'
import { isActivateCardActionNode, type ActivateCardActionParams } from './activation-action'
import type { EngineInternals } from './engine-internals'
import { ActionNode } from './nodes/action-node'

const cloneEvent = (event: GameEvent): GameEvent => JSON.parse(JSON.stringify(event)) as GameEvent

/** Join captured and live event frames, keeping the first copy of each event id. */
export function mergeContinuationEvents<T extends QueryableGameEvent>(...frames: Array<readonly T[]>): T[] {
  const seen = new Set<string>()
  return frames.flatMap((frame) => frame.filter((event) => {
    // Uncommitted preview drafts have no authoritative identity yet.
    if (!('id' in event) || typeof event.id !== 'string') return true
    if (seen.has(event.id)) return false
    seen.add(event.id)
    return true
  }))
}

/**
 * A committed transaction leaves the live event store. Keep the facts that
 * unfinished continuations still read: returned-flow reactions keep their
 * scoped prefix, and pending or deferred hosts keep their own events.
 */
export function preserveContinuationEventScopes(int: EngineInternals, committed: readonly GameEvent[]): void {
  if (committed.length === 0) return
  const nodes = int.tree.allNodes()
  for (const node of nodes) {
    if (!isActivateCardActionNode(node) || node.getState() === 'resolved' ||
      node.params.transactionEvents !== undefined ||
      typeof node.params.actionEventStartIndex !== 'number') continue
    node.params.preservedTransactionEvents = mergeContinuationEvents(
      node.params.preservedTransactionEvents ?? [], committed,
    ).map(cloneEvent)
    node.params.preservedActionEvents = mergeContinuationEvents(
      node.params.preservedActionEvents ?? [], committed.slice(node.params.actionEventStartIndex),
    ).map(cloneEvent)
    // The next transaction starts empty, so live action events start at 0.
    node.params.actionEventStartIndex = 0
  }
  const pendingHost = nodes.find((node) => node.getPending() !== null)
  for (const node of nodes) {
    if (!(node instanceof ActionNode) || node.getState() === 'resolved' ||
      (node !== pendingHost && node.deferredHostTransactionEvents === undefined)) continue
    const capturedIds = new Set((node.deferredHostTransactionEvents ?? []).map((event) => event.id))
    node.deferredHostActionEvents = mergeContinuationEvents(
      node.deferredHostActionEvents ?? [], committed.filter((event) => !capturedIds.has(event.id)),
    ).map(cloneEvent)
    node.deferredHostTransactionEvents = mergeContinuationEvents(
      node.deferredHostTransactionEvents ?? [], committed,
    ).map(cloneEvent)
  }
}

/**
 * Event scope of a card activation, shared by preview and execution. A
 * captured frame is used as is; a returned-flow reaction reads its preserved
 * prefix plus live events from its recorded action start.
 */
export function activationEventReadContext<T extends QueryableGameEvent>(
  params: ActivateCardActionParams,
  liveEvents: readonly T[],
) {
  const transactionEvents: Array<T | GameEvent> = params.transactionEvents !== undefined
    ? [...params.transactionEvents]
    : mergeContinuationEvents<T | GameEvent>(params.preservedTransactionEvents ?? [], liveEvents)
  const actionEvents: ReadonlyArray<T | GameEvent> | undefined = params.transactionEvents === undefined && typeof params.actionEventStartIndex === 'number'
    ? mergeContinuationEvents<T | GameEvent>(params.preservedActionEvents ?? [], liveEvents.slice(params.actionEventStartIndex))
    : params.actionEvents
  return {
    transactionEvents,
    actionEvents: actionEvents ? [...actionEvents] : undefined,
    eventQuery: createEventQuery(transactionEvents),
  }
}
