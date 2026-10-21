import type { ActionContext, ActionSpaceUseContext, ActionExecutionContext } from '../contract/types'
import { ActionNode, SequenceNode } from './nodes'
import type { EngineNode } from './types'
import { wrapPrimaryBody } from './primary-body-nodes'

export function wrapSpaceUse(
  id: string, body: EngineNode, spaceId: string, use: ActionSpaceUseContext,
  playerId?: string, actionContext?: ActionContext, completePlacement = false,
): SequenceNode {
  if (body instanceof ActionNode) body.actionContext = {
    ...body.actionContext,
    sourceLocation: { kind: 'actionSpace', spaceId },
    targetSpaceId: spaceId,
  }
  const scope = wrapPrimaryBody(id, body, {
    kind: 'space-use', spaceId, playerId, use, actionContext, completePlacement,
    sourceCard: body instanceof ActionNode ? body.sourceCard : undefined,
    succeeded: false, actionEvents: [],
  }, playerId)
  if (body instanceof ActionNode) body.actionSpaceUse = use
  return scope
}

export function actionSpaceQueryContext(node: EngineNode, actionId?: string): Pick<ActionExecutionContext, 'actionSpaceUse'> {
  const effectiveId = actionId ?? (node instanceof ActionNode ? node.resolvedReplacement?.actionId ?? node.actionId : undefined)
  return { actionSpaceUse: node instanceof ActionNode && effectiveId === node.actionId ? node.actionSpaceUse : undefined }
}
