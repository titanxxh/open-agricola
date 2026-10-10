import type { ActionFlow } from '../contract/types'
import { isSandboxActionId, isSandboxSpecialEffectKind, type SandboxSpecialEffectKind } from './sandbox-action-ids'

/**
 * Runtime admission for flows returned by custom cards (ADR 0025). A flow that
 * leaves the Workshop Capability Contract is rejected as a whole before any
 * node reaches the engine, so the caller can treat it like a failed hook.
 * Native card flows never pass through here.
 *
 * The contract covers names, node fields and the documented shapes of the
 * card-local special-effect writes. Parameters of the other actions stay with
 * their native consumers, exactly as for native cards.
 */

type KeysOfUnion<T> = T extends T ? keyof T : never
type LeafFlow = Extract<ActionFlow, { type: 'leaf' }>
type GroupFlow = Exclude<ActionFlow, { type: 'leaf' }>

/** Every native node field is classified here; `false` means not open to custom cards.
 * A new native field fails to compile until it is classified. */
const LEAF_FIELDS = {
  type: true,
  actionId: true,
  params: true,
  sourceCard: true,
  optional: true,
  actionContext: true,
  promptKey: true,
  anytimeWindow: true,
  optionId: false,
  choiceLabelKey: false,
  choiceLabelParams: false,
  effectPreview: false,
  targetPlayerId: false,
  expandFlow: false,
} as const satisfies Record<KeysOfUnion<LeafFlow>, boolean>

const GROUP_FIELDS = {
  type: true,
  children: true,
  sourceCard: true,
  optional: true,
  promptKey: true,
  anytimeWindow: true,
  anytimeActionId: false,
  optionId: false,
  mode: false,
  triggerSelectOnce: false,
  choiceLabelKey: false,
  choiceLabelParams: false,
  targetPlayerId: false,
} as const satisfies Record<KeysOfUnion<GroupFlow>, boolean>

type FieldShape = 'string' | 'finite' | 'boolean' | 'json'

/** docs/CUSTOM_CARD_SANDBOX.md §6.1. `json` accepts any serialized value. */
const SPECIAL_EFFECT_SHAPES: Record<SandboxSpecialEffectKind, Record<string, FieldShape>> = {
  'increment-counter': { key: 'string', amount: 'finite' },
  'set-counter': { key: 'string', value: 'finite' },
  'set-flag': { flag: 'boolean' },
  'set-infobox': { text: 'string' },
  'set-extra-data': { key: 'string', value: 'json' },
  'set-private-data': { key: 'string', value: 'json' },
  'increment-extra-data': { key: 'string', amount: 'finite' },
}

const matchesShape = (value: unknown, shape: FieldShape): boolean =>
  shape === 'json'
    || (shape === 'finite' ? typeof value === 'number' && Number.isFinite(value) : typeof value === shape)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const outsideContract = (path: string, detail: string): Error =>
  new Error(`${path}: ${detail} is not in the Workshop Capability Contract`)

export function assertSandboxActionId(actionId: unknown, path: string): void {
  if (!isSandboxActionId(actionId)) throw outsideContract(path, `actionId '${String(actionId)}'`)
}

/** A custom card may only attribute and write to itself. */
export function assertOwnSourceCard(sourceCard: unknown, cardId: string, path: string): void {
  if (sourceCard !== undefined && sourceCard !== cardId) throw new Error(`${path}: sourceCard must be this card's id`)
}

function assertNodeFields(node: Record<string, unknown>, fields: Record<string, boolean>, path: string): void {
  for (const key of Object.keys(node)) {
    if (Object.hasOwn(fields, key) && !fields[key]) throw outsideContract(path, `flow field '${key}'`)
  }
}

function assertSpecialEffectParams(params: unknown, path: string): void {
  const kind = isRecord(params) ? params.kind : undefined
  if (!isRecord(params) || !isSandboxSpecialEffectKind(kind)) {
    throw outsideContract(path, `special-effect kind '${String(kind)}'`)
  }
  for (const [field, shape] of Object.entries(SPECIAL_EFFECT_SHAPES[kind])) {
    if (!matchesShape(params[field], shape)) {
      throw new Error(`${path}: special-effect '${kind}' requires ${field} to be a ${shape === 'finite' ? 'finite number' : shape}`)
    }
  }
}

function assertFlowNode(node: unknown, cardId: string, path: string): void {
  if (!isRecord(node)) throw new Error(`${path}: must be an ActionFlow object`)
  assertOwnSourceCard(node.sourceCard, cardId, path)
  if (node.type === 'leaf') {
    assertSandboxActionId(node.actionId, path)
    assertNodeFields(node, LEAF_FIELDS, path)
    if (node.actionId === 'special-effect') assertSpecialEffectParams(node.params, path)
    return
  }
  if (node.type !== 'seq' && node.type !== 'or' && node.type !== 'xor' && node.type !== 'parallel') {
    throw outsideContract(path, `flow node type '${String(node.type)}'`)
  }
  assertNodeFields(node, GROUP_FIELDS, path)
  if (!Array.isArray(node.children)) throw new Error(`${path}: '${node.type}' requires a children array`)
  node.children.forEach((child, index) => assertFlowNode(child, cardId, `${path}.children[${index}]`))
}

/** A hook may return nothing; anything else must be a contract flow of this card. */
export function assertCustomFlow(value: unknown, cardId: string, path = 'flow'): void {
  if (value === null || value === undefined) return
  assertFlowNode(value, cardId, path)
}
