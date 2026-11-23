import type { ActionFlow } from '../contract/types'
import type { ActionHookResult } from '../actions/hooks'

/**
 * Independent reaction (reference: `ParallelNode::getChoices` with `isIndependent`):
 * a mandatory activation whose effect needs no decision and whose order against the
 * other same-timing reactions is irrelevant enough to resolve before the player
 * orders the rest.
 */
const ANIMAL_KEYS = new Set(['sheep', 'boar', 'cattle', 'horse'])

const BOOKKEEPING_SPECIAL_EFFECTS = new Set([
  'increment-extra-data',
  'set-extra-data',
  'increment-counter',
  'set-counter',
  'set-flag',
  'set-infobox',
])

const hasNoAnimals = (params: Record<string, unknown> | undefined): boolean =>
  !params || Object.entries(params).every(([key, amount]) => !ANIMAL_KEYS.has(key) || !amount)

const isIndependentLeaf = (flow: Extract<ActionFlow, { type: 'leaf' }>): boolean => {
  switch (flow.actionId) {
    case 'gain':
    case 'store-on-card':
    case 'take-from-card':
      return hasNoAnimals(flow.params)
    case 'bonus-vp':
      return true
    case 'special-effect':
      return typeof flow.params?.kind === 'string' && BOOKKEEPING_SPECIAL_EFFECTS.has(flow.params.kind)
    default:
      return false
  }
}

export const isIndependentReactionFlow = (flow: ActionFlow): boolean => {
  if (flow.optional) return false
  if (flow.type === 'leaf') return isIndependentLeaf(flow)
  if (flow.type !== 'seq' && flow.type !== 'parallel') return false
  if (flow.type === 'parallel' && flow.mode === 'trigger-select') return false
  return flow.children.every(isIndependentReactionFlow)
}

/** A previewed activation result: a flow, or a stage effect that only mutates (`doable` without a flow). */
export const isIndependentReactionResult = (result: ActionHookResult | undefined, stageEffect: boolean): boolean => {
  if (!result) return false
  if ((result.followUpActions?.length ?? 0) > 0) return false
  if (result.flow) return isIndependentReactionFlow(result.flow)
  return stageEffect && result.doable === true
}
