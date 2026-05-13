import type { ActionFlow } from '../contract/types'

const INTERACTIVE_LEAF_ACTION_PREFIXES = ['farm-select', 'animal-reorg', 'card-draft', 'feed']
const INTERACTIVE_LEAF_ACTION_EXACT = new Set([
  'plow', 'sow', 'fence', 'build-room', 'build-stable',
  'renovate-house', 'occupation', 'improvement-any', 'minor-improvement',
])

function leafHasAltCosts(params: Record<string, unknown> | undefined): boolean {
  if (!params) return false
  const altCosts = params.altCosts
  return Array.isArray(altCosts) && altCosts.length > 1
}

function leafActionIsInteractive(actionId: string): boolean {
  if (INTERACTIVE_LEAF_ACTION_EXACT.has(actionId)) return true
  return INTERACTIVE_LEAF_ACTION_PREFIXES.some((p) => actionId.startsWith(p))
}

export function analyzeFlowInteractivity(flow: ActionFlow): 'auto' | 'interactive' {
  if (flow.type === 'leaf') {
    if (flow.actionId === 'pay' && leafHasAltCosts(flow.params)) return 'interactive'
    if (leafActionIsInteractive(flow.actionId)) return 'interactive'
    return 'auto'
  }
  if (flow.type === 'xor' || flow.type === 'or') return 'interactive'
  // seq or parallel
  if (flow.optional) return 'interactive'
  return flow.children.some((c) => analyzeFlowInteractivity(c) === 'interactive')
    ? 'interactive'
    : 'auto'
}
