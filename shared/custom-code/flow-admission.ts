import { REAL_RESOURCE_KEYS, isPaymentResourceKey } from '../contract/resource-keys'
import type { ActionFlow } from '../contract/types'
import { isSandboxActionId, isSandboxSpecialEffectKind, type SandboxActionId, type SandboxSpecialEffectKind } from './sandbox-action-ids'

/**
 * Runtime admission for flows returned by custom cards (ADR 0025). A flow that
 * leaves the Workshop Capability Contract is rejected as a whole before any
 * node reaches the engine, so the caller can treat it like a failed hook.
 * Native card flows never pass through here.
 *
 * The contract covers names, node fields, the parameter keys each action
 * documents, and the field types of the card-local special-effect writes.
 * Parameter values (amounts, cost rules, schedules) stay with their native
 * consumers, exactly as for native cards.
 */

type KeysOfUnion<T> = T extends T ? keyof T : never
type LeafFlow = Extract<ActionFlow, { type: 'leaf' }>
type GroupFlow = Exclude<ActionFlow, { type: 'leaf' }>

/** Every native node field is classified here; `false` means not open to custom cards.
 * A new native field fails to compile until it is classified. A field that is not
 * listed at all is rejected too, so a misspelled `optional` cannot silently change a flow. */
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

/** docs/CUSTOM_CARD_SANDBOX.md §6.1. `json` accepts any serialized value, but the field must be present. */
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
  shape === 'json' ? value !== undefined
    : shape === 'finite' ? typeof value === 'number' && Number.isFinite(value)
      : typeof value === shape

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

/** Whether a custom card may set this field on a leaf or on a group node. */
export const isOpenFlowField = (node: 'leaf' | 'group', field: string): boolean => {
  const fields: Record<string, boolean> = node === 'leaf' ? LEAF_FIELDS : GROUP_FIELDS
  return Object.hasOwn(fields, field) && fields[field]!
}

function assertNodeFields(node: Record<string, unknown>, kind: 'leaf' | 'group', path: string): void {
  const field = Object.keys(node).find(key => !isOpenFlowField(kind, key))
  if (field !== undefined) throw outsideContract(path, `flow field '${field}'`)
}

function assertSpecialEffectParams(params: Record<string, unknown>, _cardId: string, path: string): void {
  const kind = params.kind
  if (!isSandboxSpecialEffectKind(kind)) throw outsideContract(path, `special-effect kind '${String(kind)}'`)
  for (const [field, shape] of Object.entries(SPECIAL_EFFECT_SHAPES[kind])) {
    if (!matchesShape(params[field], shape)) {
      const expected = shape === 'finite' ? 'a finite number' : shape === 'json' ? 'present' : `a ${shape}`
      throw new Error(`${path}: special-effect '${kind}' requires ${field} to be ${expected}`)
    }
  }
}

type ParamRule = (params: Record<string, unknown>, cardId: string, path: string) => void

const REAL_RESOURCES = new Set<string>(REAL_RESOURCE_KEYS)

const onlyKeys = (actionId: string, allows: (key: string) => boolean): ParamRule => (params, _cardId, path) => {
  const key = Object.keys(params).find(candidate => !allows(candidate))
  if (key !== undefined) throw outsideContract(path, `${actionId} param '${key}'`)
}
const resourceMap = (actionId: string): ParamRule => onlyKeys(actionId, key => REAL_RESOURCES.has(key))

/** The parameter keys each action documents (docs/CUSTOM_CARD_SANDBOX.md §6). Native-only
 * controls such as a gain's payerId are not open to custom cards. */
const PARAM_RULES: Record<SandboxActionId, ParamRule> = {
  gain: resourceMap('gain'),
  'store-on-card': resourceMap('store-on-card'),
  'take-from-card': resourceMap('take-from-card'),
  // Either a flat resource cost, or the payLeaf wrapper whose cost the payment solver validates.
  pay: (params, cardId, path) => (Object.hasOwn(params, 'cost')
    ? onlyKeys('pay', key => key === 'cost')
    : onlyKeys('pay', isPaymentResourceKey))(params, cardId, path),
  'bonus-vp': onlyKeys('bonus-vp', () => false),
  'bake-bread': onlyKeys('bake-bread', () => false),
  'push-to-card-stack': onlyKeys('push-to-card-stack', key => key === 'item'),
  'special-effect': assertSpecialEffectParams,
  'future-meeples': (params, cardId, path) => {
    onlyKeys('future-meeples', key => key === '__futureMeepleRequest')(params, cardId, path)
    const request = params.__futureMeepleRequest
    if (!isRecord(request)) throw new Error(`${path}: future-meeples requires params.__futureMeepleRequest`)
    if (request.cardId !== cardId) throw new Error(`${path}: __futureMeepleRequest.cardId must be this card's id`)
  },
}

function admitFlowNode(node: unknown, cardId: string, path: string): void {
  if (!isRecord(node)) throw new Error(`${path}: must be an ActionFlow object`)
  assertOwnSourceCard(node.sourceCard, cardId, path)
  if (node.type === 'leaf') {
    assertSandboxActionId(node.actionId, path)
    assertNodeFields(node, 'leaf', path)
    if (node.params !== undefined && !isRecord(node.params)) throw new Error(`${path}: params must be an object`)
    PARAM_RULES[node.actionId as SandboxActionId](node.params ?? {}, cardId, path)
    // An omitted source would be settled without card attribution.
    node.sourceCard = cardId
    return
  }
  if (node.type !== 'seq' && node.type !== 'or' && node.type !== 'xor' && node.type !== 'parallel') {
    throw outsideContract(path, `flow node type '${String(node.type)}'`)
  }
  // Checked first: `items` or `steps` in place of `children` deserves the specific message.
  if (!Array.isArray(node.children)) throw new Error(`${path}: '${node.type}' requires a children array`)
  assertNodeFields(node, 'group', path)
  node.children.forEach((child, index) => admitFlowNode(child, cardId, `${path}.children[${index}]`))
}

/** A hook may return nothing; anything else must be a contract flow of this card.
 * Admission also binds each leaf to the card, so the returned object is updated in place. */
export function admitCustomFlow(value: unknown, cardId: string, path = 'flow'): void {
  if (value === null || value === undefined) return
  admitFlowNode(value, cardId, path)
}
