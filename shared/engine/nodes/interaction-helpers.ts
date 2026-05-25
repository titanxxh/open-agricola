/**
 * S4b Task 13 — sourceCard / label / replace-aware helpers absorbed from
 * `shared/engine/engine.ts`. These are pure (or dependency-injected) helpers
 * operating on EngineNode subtrees; the engine no longer holds them as
 * instance methods. Pre-PR3 they lived as `Engine.attachChoiceLabel /
 * getChoiceLabel / getNodeSourceCard / buildReplaceChoiceFlow /
 * getReplaceAwareChoiceLabel`. Two of them (`getChoiceLabel`,
 * `getReplaceAwareChoiceLabel`) accept the engine's `ActionRegistry` /
 * `HookDispatcher` as explicit parameters because they read the action's
 * default `nameKey` and run the `computeReplace` hook respectively.
 */

import type {
  ActionExecutionContext,
  ActionFlow,
  ActionChoiceOption,
} from '../../contract/types'
import type { ActionRegistry } from '../registry'
import type { HookDispatcher } from '../dispatcher'
import type { EngineNode } from '../types'
import { ActionNode } from './action-node'
import { SequenceNode } from './sequence-node'
import { ParallelNode } from './parallel-node'
import { OrNode } from './or-node'
import { XorNode } from './xor-node'
import { withSkippedComputeReplaceListeners } from '../replace-guard'

export function getOptionsSourceCard(options: ActionChoiceOption[]): string | undefined {
  if (options.length === 0) return undefined
  const normalized = options.map((option) =>
    typeof option.sourceCard === 'string' && option.sourceCard.length > 0
      ? option.sourceCard
      : null,
  )
  if (normalized.some((sourceCard) => sourceCard === null)) return undefined
  const sourceCards = [...new Set(normalized)] as string[]
  return sourceCards.length === 1 ? sourceCards[0] : undefined
}

export function resolveChoiceSourceCard(
  sourceCard: string | undefined,
  options: ActionChoiceOption[],
): string | undefined {
  return sourceCard ?? getOptionsSourceCard(options)
}

/**
 * Stamp `choiceLabelKey` / `choiceLabelParams` onto an EngineNode. The fields
 * live on `BaseNode` (assignable on every node subclass) so the cast is
 * structural only. No-op when `choiceLabelKey` is undefined.
 */
export function attachChoiceLabel(
  node: EngineNode,
  choiceLabelKey?: string,
  choiceLabelParams?: Record<string, unknown>,
): EngineNode {
  if (!choiceLabelKey) return node
  const labeledNode = node as EngineNode & {
    choiceLabelKey?: string
    choiceLabelParams?: Record<string, unknown>
  }
  labeledNode.choiceLabelKey = choiceLabelKey
  labeledNode.choiceLabelParams = choiceLabelParams
  return node
}

/**
 * Walk an EngineNode subtree to derive the choice label: explicit
 * `choiceLabelKey` wins; ActionNode falls back to its registered action's
 * `nameKey`; composite nodes recurse into their first labelled descendant.
 * Returns `null` when no label is found.
 *
 * Needs the `ActionRegistry` to look up `nameKey` for ActionNode fallbacks.
 */
export function getChoiceLabel(
  node: EngineNode,
  registry: ActionRegistry,
): { labelKey: string; labelParams?: Record<string, unknown> } | null {
  const labeledNode = node as EngineNode & {
    choiceLabelKey?: string
    choiceLabelParams?: Record<string, unknown>
  }
  if (labeledNode.choiceLabelKey) {
    return {
      labelKey: labeledNode.choiceLabelKey,
      labelParams: labeledNode.choiceLabelParams,
    }
  }
  if (node instanceof ActionNode) {
    const action = registry.get(node.actionId)
    if (!action) return null
    return {
      labelKey: node.choiceLabelKey ?? action.nameKey,
      labelParams: node.choiceLabelParams,
    }
  }
  if ('children' in node) {
    const composite = node as { children: EngineNode[] }
    for (const child of composite.children) {
      const label = getChoiceLabel(child, registry)
      if (label) return label
    }
  }
  return null
}

/**
 * Aggregate the sourceCard advertised by every descendant `ActionNode` of
 * `node`. Returns the unique value when all leaves agree, otherwise
 * `undefined` (mixed or absent sourceCards). Pure recursion — no
 * dependencies.
 */
export function getNodeSourceCard(node: EngineNode): string | undefined {
  const sourceCards = new Set<string>()
  const visit = (entry: EngineNode) => {
    if (entry instanceof ActionNode) {
      if (entry.sourceCard) sourceCards.add(entry.sourceCard)
      return
    }
    if (
      entry instanceof SequenceNode ||
      entry instanceof ParallelNode ||
      entry instanceof OrNode ||
      entry instanceof XorNode
    ) {
      entry.children.forEach(visit)
    }
  }
  visit(node)
  return sourceCards.size === 1 ? [...sourceCards][0] : undefined
}

/**
 * Recursively walk an `ActionFlow` (the declarative tree, not the live
 * EngineNode tree) and return the unique `sourceCard` if every leaf agrees.
 * Used by `getReplaceAwareChoiceLabel` to pick the alternative-flow card.
 * Pure recursion — no dependencies.
 */
export function getFlowSourceCard(flow: ActionFlow): string | undefined {
  if (flow.type === 'leaf') return flow.sourceCard
  const sourceCards = [...new Set(
    flow.children
      .map((child) => getFlowSourceCard(child))
      .filter((sourceCard): sourceCard is string => typeof sourceCard === 'string' && sourceCard.length > 0),
  )]
  return sourceCards.length === 1 ? sourceCards[0] : undefined
}

/**
 * Mark the original declined action as having been processed by
 * `computeReplace`. The original-action branch keeps the broad
 * `checkedReplaceAction` marker because card-local replacement listeners use
 * it to avoid re-wrapping the declined root action.
 */
function markCheckedReplaceAction(
  actionContext?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(actionContext ?? {}),
    checkedReplaceAction: true,
  }
}

function markFlowSkippedComputeReplaceListeners(
  flow: ActionFlow,
  listenerIds: readonly string[],
): ActionFlow {
  if (flow.type === 'leaf') {
    return {
      ...flow,
      actionContext: withSkippedComputeReplaceListeners(flow.actionContext, listenerIds),
    }
  }
  return {
    ...flow,
    children: flow.children.map((child) =>
      markFlowSkippedComputeReplaceListeners(child, listenerIds)),
  }
}

/**
 * Wrap an alternative flow + the original (now declined) action into a `xor`
 * flow node so the engine can present "do alternative / take original" as
 * two choices. Pure transformation — no dependencies.
 */
export function buildReplaceChoiceFlow(
  actionNode: Pick<
    ActionNode,
    'actionId' | 'params' | 'sourceCard' | 'actionContext' | 'choiceLabelKey' | 'choiceLabelParams'
  >,
  alternativeFlow: ActionFlow,
  replacedActionId: string,
  replacementListenerIds: readonly string[] = [],
): ActionFlow {
  const guardedAlternativeFlow = markFlowSkippedComputeReplaceListeners(
    alternativeFlow,
    replacementListenerIds,
  )
  return {
    type: 'xor',
    children: [
      ...(guardedAlternativeFlow.type === 'xor'
        ? guardedAlternativeFlow.children
        : [guardedAlternativeFlow]),
      {
        type: 'leaf',
        actionId: replacedActionId,
        params: actionNode.params,
        sourceCard: actionNode.sourceCard,
        actionContext: markCheckedReplaceAction(actionNode.actionContext),
        choiceLabelKey: actionNode.choiceLabelKey,
        choiceLabelParams: actionNode.choiceLabelParams,
      },
    ],
  }
}

/**
 * Compute the choice label that an OrNode/XorNode option should surface,
 * accounting for the `computeReplace` hook. When the hook declines, the
 * label flips to `ui.interactionActionOrReplace` so the player sees a
 * "do action OR alternative" prompt; otherwise the original label stands.
 * Always returns a `sourceCard` field so callers don't need to derive it from
 * `getNodeSourceCard` themselves.
 *
 * Needs the `HookDispatcher` to invoke `computeReplace`. The default-source
 * helper is injected so this label helper stays focused on choice metadata
 * while the caller owns flow-tree normalization.
 */
export function getReplaceAwareChoiceLabel(
  actionNode: ActionNode,
  executionContext: ActionExecutionContext,
  defaultLabel: { labelKey: string; labelParams?: Record<string, unknown> },
  hooks: HookDispatcher,
  applyDefaultSourceCardToFlow: (flow: ActionFlow, sourceCard?: string) => ActionFlow,
): { labelKey: string; labelParams?: Record<string, unknown>; sourceCard?: string } {
  const replaceResult = hooks.applyComputeReplace({
    ...executionContext,
    actionId: actionNode.actionId,
  })
  const replaceSourceCard = replaceResult.sourceCard ?? actionNode.sourceCard
  if (actionNode.choiceLabelKey) return { ...defaultLabel, sourceCard: replaceSourceCard }
  if (!replaceResult.declined || !replaceResult.alternativeFlow) {
    return { ...defaultLabel, sourceCard: replaceSourceCard }
  }
  const alternativeFlow = applyDefaultSourceCardToFlow(
    replaceResult.alternativeFlow,
    replaceResult.sourceCard,
  )
  return {
    labelKey: 'ui.interactionActionOrReplace',
    labelParams: { actionNameKey: defaultLabel.labelKey },
    sourceCard: getFlowSourceCard(alternativeFlow),
  }
}

// Suppress unused-import warning for ActionChoiceOption — it's part of the
// re-export's transitive type surface.
export type { ActionChoiceOption }
