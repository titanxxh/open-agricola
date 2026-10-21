import type { ActionFlow } from '../contract/types'

export function inheritSpaceEffectSource(flow: ActionFlow, context: Record<string, unknown> | undefined): ActionFlow {
  const source = context?.sourceLocation
  if (!source || typeof source !== 'object' || !('kind' in source) || source.kind !== 'actionSpace') return flow
  if (flow.type === 'leaf') return {
    ...flow,
    actionContext: {
      sourceLocation: source,
      ...(typeof context?.targetSpaceId === 'string' ? { targetSpaceId: context.targetSpaceId } : {}),
      ...flow.actionContext,
    },
  }
  return { ...flow, children: flow.children.map(child => inheritSpaceEffectSource(child, context)) }
}
