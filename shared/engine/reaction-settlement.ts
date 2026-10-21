import type { EngineInternals } from './engine-internals'
import type { EngineNode } from './types'
import { SequenceNode } from './nodes'
import { inheritPrimaryBody } from './primary-body-nodes'

export function settleHostReactions(int: EngineInternals, host: EngineNode | null | undefined, nodes: EngineNode[]): EngineNode[] {
  const settled: EngineNode[] = []
  for (const boundary of ['body', 'action'] as const) {
    const children = nodes.filter(node => node.reactionSettlement === boundary)
    if (!children.length) continue
    const barrier = new SequenceNode(`reaction-${boundary}-${int.counterRef.value++}`, children)
    barrier.completionBarrier = true
    if (boundary === 'body' && host) inheritPrimaryBody(host, barrier)
    settled.push(barrier)
  }
  return [...settled, ...nodes.filter(node => node.reactionSettlement !== 'body' && node.reactionSettlement !== 'action')]
}
