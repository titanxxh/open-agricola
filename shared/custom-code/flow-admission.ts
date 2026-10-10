import { REAL_RESOURCE_KEYS, isPaymentResourceKey } from '../contract/resource-keys'
import type { ActionFlow } from '../contract/types'
import { isSandboxActionId, isSandboxSpecialEffectKind, type SandboxActionId, type SandboxSpecialEffectKind } from './sandbox-action-ids'

/**
 * Runtime admission for flows returned by custom cards (ADR 0025). A flow that
 * leaves the Workshop Capability Contract is rejected as a whole before any
 * node reaches the engine, so the caller can treat it like a failed hook.
 * Native card flows never pass through here.
 *
 * The contract covers names, node fields and the types of the open control
 * fields, the parameter keys each action documents, the types of the params
 * the native farm and card actions take, and the field types of the card-local
 * special-effect writes. Other parameter values (amounts, cost rules,
 * schedules) stay with their native consumers, exactly as for native cards.
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
  'pop-card-stack-top': {},
  'remove-future-meeples': {},
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

/** The type a documented key must hold. The native actions fall back to a default on any
 * other type, so `types: 'minor'` would otherwise offer every improvement. */
type KeyTypes = Record<string, { expected: string; matches: (value: unknown) => boolean }>

const finiteNumber = { expected: 'a finite number', matches: (value: unknown) => matchesShape(value, 'finite') }

/** The documented actionContext keys: `targetPlayerId` on any leaf, plus the keys an action
 * reads only from there. The rest are native execution controls. */
const ACTION_CONTEXT_KEYS: Partial<Record<SandboxActionId, KeyTypes>> = {
  selection: {
    selectableTiles: { expected: 'an array of { row, col }', matches: Array.isArray },
    minSelections: finiteNumber,
    maxSelections: finiteNumber,
  },
}

/** Source validation passes no action when a leaf's actionId is computed; the executors decide then. */
export const isOpenActionContextKey = (key: string, actionId?: string): boolean =>
  key === 'targetPlayerId'
  || (actionId === undefined
    ? Object.values(ACTION_CONTEXT_KEYS).some(keys => Object.hasOwn(keys, key))
    : isSandboxActionId(actionId) && Object.hasOwn(ACTION_CONTEXT_KEYS[actionId] ?? {}, key))

/** What a custom leaf of these actions always means. Admission writes it, so a card cannot
 * present its own reap as the Harvest field phase or its breeding as Harvest breeding. */
const BOUND_ACTION_CONTEXT: Partial<Record<SandboxActionId, (cardId: string) => Record<string, unknown>>> = {
  reap: () => ({ trigger: { phase: 'private-field-phase' } }),
  breed: cardId => ({ sourceCard: cardId }),
}

/** A replacement `actionId` and a `followUpActions` entry name an action without a node, so
 * they cannot carry what admission binds on a leaf of these actions. */
export function assertSandboxFollowUpActionId(actionId: unknown, path: string): void {
  assertSandboxActionId(actionId, path)
  if (BOUND_ACTION_CONTEXT[actionId as SandboxActionId]) {
    throw new Error(`${path}: actionId '${String(actionId)}' must be returned as a flow leaf`)
  }
}

const isAnytimeWindow = (value: unknown): boolean =>
  isRecord(value) && typeof value.allowed === 'boolean'
  && Object.keys(value).every(key => key === 'allowed' || key === 'blockedIds')
  && (value.blockedIds === undefined
    || (Array.isArray(value.blockedIds) && value.blockedIds.every(id => typeof id === 'string')))

/** The value each open control field must hold. The engine reads these by truthiness or
 * passes them on, so `optional: 'false'` would otherwise make a step optional. `literal`
 * is the kind of literal source validation accepts for the field. */
const CONTROL_FIELDS = {
  optional: { expected: 'a boolean', literal: 'boolean', matches: (value: unknown) => typeof value === 'boolean' },
  promptKey: { expected: 'a string', literal: 'string', matches: (value: unknown) => typeof value === 'string' },
  anytimeWindow: { expected: '{ allowed: boolean, blockedIds?: string[] }', literal: 'object', matches: isAnytimeWindow },
} as const

export type ControlFieldLiteral = (typeof CONTROL_FIELDS)[keyof typeof CONTROL_FIELDS]['literal']

/** For source validation: the literal kind and wording an open control field expects. */
export const controlFieldExpectation = (field: string): { expected: string; literal: ControlFieldLiteral } | undefined =>
  Object.hasOwn(CONTROL_FIELDS, field) ? CONTROL_FIELDS[field as keyof typeof CONTROL_FIELDS] : undefined

function assertControlFields(node: Record<string, unknown>, path: string): void {
  for (const [field, rule] of Object.entries(CONTROL_FIELDS)) {
    if (node[field] !== undefined && !rule.matches(node[field])) throw new Error(`${path}: ${field} must be ${rule.expected}`)
  }
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
  // The one optional field: the rounds a removal is limited to.
  const rounds = kind === 'remove-future-meeples' ? params.rounds : undefined
  if (rounds !== undefined && !(Array.isArray(rounds) && rounds.every(round => matchesShape(round, 'finite')))) {
    throw new Error(`${path}: special-effect '${kind}' requires rounds to be an array of numbers`)
  }
}

type ParamRule = (params: Record<string, unknown>, cardId: string, path: string) => void

const REAL_RESOURCES = new Set<string>(REAL_RESOURCE_KEYS)

const onlyKeys = (actionId: string, allows: (key: string) => boolean): ParamRule => (params, _cardId, path) => {
  const key = Object.keys(params).find(candidate => !allows(candidate))
  if (key !== undefined) throw outsideContract(path, `${actionId} param '${key}'`)
}
const resourceMap = (actionId: string): ParamRule => onlyKeys(actionId, key => REAL_RESOURCES.has(key))
const noParams = (actionId: string): ParamRule => onlyKeys(actionId, () => false)

function assertKeyTypes(values: Record<string, unknown>, types: KeyTypes, label: string, path: string): void {
  for (const [key, rule] of Object.entries(types)) {
    if (values[key] !== undefined && !rule.matches(values[key])) throw new Error(`${path}: ${label} '${key}' must be ${rule.expected}`)
  }
}
const typedParams = (actionId: string, types: KeyTypes): ParamRule => (params, cardId, path) => {
  onlyKeys(actionId, key => Object.hasOwn(types, key))(params, cardId, path)
  assertKeyTypes(params, types, `${actionId} param`, path)
}

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
  'bonus-vp': noParams('bonus-vp'),
  'bake-bread': noParams('bake-bread'),
  'push-to-card-stack': onlyKeys('push-to-card-stack', key => key === 'item'),
  'special-effect': assertSpecialEffectParams,
  'future-meeples': (params, cardId, path) => {
    onlyKeys('future-meeples', key => key === '__futureMeepleRequest')(params, cardId, path)
    const request = params.__futureMeepleRequest
    if (!isRecord(request)) throw new Error(`${path}: future-meeples requires params.__futureMeepleRequest`)
    if (request.cardId !== cardId) throw new Error(`${path}: __futureMeepleRequest.cardId must be this card's id`)
  },
  plow: noParams('plow'),
  sow: noParams('sow'),
  fence: noParams('fence'),
  stables: noParams('stables'),
  construct: noParams('construct'),
  'renovate-house': noParams('renovate-house'),
  improvement: typedParams('improvement', {
    types: {
      expected: "a non-empty array of 'major' or 'minor'",
      matches: value => Array.isArray(value) && value.length > 0 && value.every(type => type === 'major' || type === 'minor'),
    },
  }),
  occupation: typedParams('occupation', { exactCost: { expected: 'a resource object', matches: isRecord } }),
  'family-growth': noParams('family-growth'),
  breed: noParams('breed'),
  reap: noParams('reap'),
  exchange: noParams('exchange'),
  'set-first-player': noParams('set-first-player'),
  selection: noParams('selection'),
  'emit-choice': typedParams('emit-choice', {
    options: { expected: 'an array of { value, labelKey }', matches: Array.isArray },
    promptKey: { expected: 'a string', matches: value => typeof value === 'string' },
  }),
  reorganize: noParams('reorganize'),
}

function admitFlowNode(node: unknown, cardId: string, path: string): void {
  if (!isRecord(node)) throw new Error(`${path}: must be an ActionFlow object`)
  assertOwnSourceCard(node.sourceCard, cardId, path)
  if (node.type === 'leaf') {
    assertSandboxActionId(node.actionId, path)
    const actionId = node.actionId as SandboxActionId
    assertNodeFields(node, 'leaf', path)
    assertControlFields(node, path)
    const bound = BOUND_ACTION_CONTEXT[actionId]?.(cardId)
    const context = node.actionContext
    if (context !== undefined) {
      if (!isRecord(context)) throw new Error(`${path}: actionContext must be an object`)
      // A flow can be admitted more than once, so the values admission wrote earlier pass.
      const key = Object.keys(context).find(candidate => !isOpenActionContextKey(candidate, actionId)
        && JSON.stringify(context[candidate]) !== JSON.stringify(bound?.[candidate]))
      if (key !== undefined) throw outsideContract(path, `actionContext key '${key}'`)
      assertKeyTypes(context, ACTION_CONTEXT_KEYS[actionId] ?? {}, 'actionContext key', path)
      if (context.targetPlayerId !== undefined && typeof context.targetPlayerId !== 'string') {
        throw new Error(`${path}: actionContext.targetPlayerId must be a string`)
      }
    }
    if (node.params !== undefined && !isRecord(node.params)) throw new Error(`${path}: params must be an object`)
    PARAM_RULES[actionId](node.params ?? {}, cardId, path)
    // An omitted source would be settled without card attribution.
    node.sourceCard = cardId
    if (bound) node.actionContext = { ...context, ...bound }
    return
  }
  if (node.type !== 'seq' && node.type !== 'or' && node.type !== 'xor' && node.type !== 'parallel') {
    throw outsideContract(path, `flow node type '${String(node.type)}'`)
  }
  // Checked first: `items` or `steps` in place of `children` deserves the specific message.
  if (!Array.isArray(node.children)) throw new Error(`${path}: '${node.type}' requires a children array`)
  assertNodeFields(node, 'group', path)
  assertControlFields(node, path)
  node.children.forEach((child, index) => admitFlowNode(child, cardId, `${path}.children[${index}]`))
}

/** A hook may return nothing; anything else must be a contract flow of this card.
 * Admission also binds each leaf to the card, so the returned object is updated in place. */
export function admitCustomFlow(value: unknown, cardId: string, path = 'flow'): void {
  if (value === null || value === undefined) return
  admitFlowNode(value, cardId, path)
}
