import { operationsMetrics, safe } from '../observability/metrics'
import { performance } from 'node:perf_hooks'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Room } from './room.ts'

// Reserve every touched room and connection before awaiting any predecessor.
// Nested lifecycle operations may reuse locks already held by their command.
const queues = new WeakMap<object, Promise<void>>()
const active = new Set<Promise<void>>()
const waiting = new Map<object, number>()
const updateQueue = () => safe(() => {
  operationsMetrics.queueDepth.set(waiting.size)
  operationsMetrics.queuedAt.set(waiting.size ? Math.min(...waiting.values()) : 0)
})
const held = new AsyncLocalStorage<{ keys: ReadonlySet<object>; active: boolean }>()

export function enqueueRoomWork<T>(keys: readonly object[], work: () => T | Promise<T>): Promise<T> {
  const unique = [...new Set(keys)]
  const scope = held.getStore()
  const current = scope?.active ? scope.keys : undefined
  if (current && unique.every(key => current.has(key))) return Promise.resolve().then(work)
  if (current) throw new Error('Nested room work must not acquire additional locks')
  const predecessors = unique.map(key => queues.get(key)).filter(value => value !== undefined)
  const observation = {}
  const start = performance.now()
  waiting.set(observation, Date.now() / 1000)
  updateQueue()
  const result = Promise.all(predecessors).then(async () => {
    waiting.delete(observation)
    updateQueue()
    safe(() => operationsMetrics.operationDuration.observe({ stage: 'queue', outcome: 'ok' }, (performance.now() - start) / 1000))
    const scope = { keys: new Set(unique), active: true }
    try { return await held.run(scope, work) } finally { scope.active = false }
  })
  const tail = result.then(() => undefined, () => undefined)
  active.add(tail)
  for (const key of unique) queues.set(key, tail)
  void tail.then(() => {
    active.delete(tail)
    for (const key of unique) if (queues.get(key) === tail) queues.delete(key)
  })
  return result
}

export const enqueueRoomTask = <T>(room: Room, work: () => T | Promise<T>): Promise<T> =>
  enqueueRoomWork([room], work)

export const waitForConnection = async (connection: object): Promise<void> => {
  await queues.get(connection)
}

export async function drainRoomWork(): Promise<void> {
  while (active.size) await Promise.all([...active])
}

const commandQueues = new Map<string, { key: object; users: number }>()
/** Creation has no Room object yet; duplicate identities still share one queue. */
export function enqueueRoomCommand<T>(identity: { scopeId: string; commandId: string } | undefined, keys: readonly object[], work: () => T | Promise<T>): Promise<T> {
  if (!identity || typeof identity.scopeId !== 'string' || typeof identity.commandId !== 'string' || identity.scopeId.length !== 36 || identity.commandId.length !== 36) return enqueueRoomWork(keys, work)
  const id = `${identity.scopeId}:${identity.commandId}`
  const entry = commandQueues.get(id) ?? { key: {}, users: 0 }
  commandQueues.set(id, entry)
  entry.users++
  return enqueueRoomWork([...keys, entry.key], work).finally(() => {
    if (--entry.users === 0) commandQueues.delete(id)
  })
}
