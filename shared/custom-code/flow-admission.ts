import { isSandboxActionId, isSandboxSpecialEffectKind } from './sandbox-action-ids'

/**
 * Runtime admission for flows returned by custom cards (ADR 0025). A flow that
 * leaves the Workshop Capability Contract is rejected as a whole before any
 * node reaches the engine, so the caller can treat it like a failed hook.
 * Native card flows never pass through here.
 */

const COMPOSITE_TYPES = new Set(['seq', 'or', 'xor', 'parallel'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const outsideContract = (path: string, detail: string): Error =>
  new Error(`${path}: ${detail} is not in the Workshop Capability Contract`)

export function assertSandboxActionId(actionId: unknown, path: string): void {
  if (!isSandboxActionId(actionId)) throw outsideContract(path, `actionId '${String(actionId)}'`)
}

function assertFlowNode(node: unknown, path: string): void {
  if (!isRecord(node)) throw new Error(`${path}: must be an ActionFlow object`)
  if (node.type === 'leaf') {
    assertSandboxActionId(node.actionId, path)
    if (node.actionId === 'special-effect') {
      const kind = isRecord(node.params) ? node.params.kind : undefined
      if (!isSandboxSpecialEffectKind(kind)) throw outsideContract(path, `special-effect kind '${String(kind)}'`)
    }
    return
  }
  if (typeof node.type !== 'string' || !COMPOSITE_TYPES.has(node.type)) {
    throw outsideContract(path, `flow node type '${String(node.type)}'`)
  }
  if (!Array.isArray(node.children)) throw new Error(`${path}: '${node.type}' requires a children array`)
  node.children.forEach((child, index) => assertFlowNode(child, `${path}.children[${index}]`))
}

/** A hook may return nothing; anything else must be a contract flow. */
export function assertCustomFlow(value: unknown, path = 'flow'): void {
  if (value === null || value === undefined) return
  assertFlowNode(value, path)
}
