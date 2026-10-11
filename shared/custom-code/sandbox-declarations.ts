import type { BeforeEndGameScope } from '../cards/card-effects'
import type { CardListenerZone } from '../cards/card-listeners'
import { REAL_RESOURCE_KEYS } from '../contract/resource-keys'
import type { InteractionRequest, ResourceKey } from '../contract/types'

/**
 * Data a Workshop card may declare beside its functions (ADR 0025): metadata on
 * `CARD_IMPL.effect` and data fields on a listener. Both manifest extraction
 * scripts copy exactly these keys, and admission checks the type each must hold.
 * The engine reads several of them by truthiness, so `mandatory: 'false'` would
 * otherwise make a listener mandatory.
 */

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string')
/** A misspelled resource would match no exchange and switch the declaration off without a word. */
const isResourceNameArray = (value: unknown): boolean =>
  isStringArray(value) && value.every(name => (REAL_RESOURCE_KEYS as readonly string[]).includes(name))

/** Every interaction kind. The type check fails when the engine gains or loses one. */
const INTERACTION_KINDS = {
  choice: true,
  'animal-reorg': true,
  'confirm-next-player': true,
  'confirm-player-switch': true,
  feed: true,
  heating: true,
  'farm-select': true,
  selection: true,
  'card-draft': true,
  'select-trigger': true,
  'engine-blocked': true,
  'resource-quantity-select': true,
  'resource-batch-exchange-select': true,
} as const satisfies Record<InteractionRequest['kind'], true>

export const sandboxInteractionKinds = Object.keys(INTERACTION_KINDS) as InteractionRequest['kind'][]

/** A misspelled kind would never match, and the entry would stay offered during that interaction. */
const isInteractionKindArray = (value: unknown): boolean =>
  isStringArray(value) && value.every(kind => Object.hasOwn(INTERACTION_KINDS, kind))

type Rule = { expected: string; matches: (value: unknown) => boolean }

/** `handHooks` is the seventh metadata key; its hook names are admitted with the effect hooks. */
const EFFECT_METADATA = {
  beforeEndGameScope: {
    expected: "'owner' or 'allPlayers'",
    matches: (value: unknown) => value === 'owner' || value === 'allPlayers',
  },
  beforeEndGameMandatory: { expected: 'a boolean', matches: isBoolean },
  preHarvestGoodsWanted: { expected: 'an array of resource names', matches: isResourceNameArray },
  preHarvestGoodsWantedBeforeReap: { expected: 'an array of resource names', matches: isResourceNameArray },
  maySkipHarvestFieldPhase: { expected: 'a boolean', matches: isBoolean },
  extraTurnBeforeWorkers: { expected: 'a boolean', matches: isBoolean },
} as const satisfies Record<string, Rule>

const LISTENER_DATA_FIELDS = {
  zones: {
    expected: "an array of 'played' or 'hand'",
    matches: (value: unknown) => isStringArray(value) && value.every(zone => zone === 'played' || zone === 'hand'),
  },
  mandatory: { expected: 'a boolean', matches: isBoolean },
  preScoring: { expected: 'a boolean', matches: isBoolean },
  replacesTurn: { expected: 'a boolean', matches: isBoolean },
  blockedAnytimeInteractionKinds: { expected: 'an array of interaction kinds', matches: isInteractionKindArray },
} as const satisfies Record<string, Rule>

export type SandboxEffectMetadataKey = keyof typeof EFFECT_METADATA
export type SandboxListenerDataField = keyof typeof LISTENER_DATA_FIELDS

export const sandboxEffectMetadataKeys = Object.keys(EFFECT_METADATA) as SandboxEffectMetadataKey[]
export const sandboxListenerDataFields = Object.keys(LISTENER_DATA_FIELDS) as SandboxListenerDataField[]

export type SandboxEffectMetadata = {
  beforeEndGameScope?: BeforeEndGameScope
  beforeEndGameMandatory?: boolean
  preHarvestGoodsWanted?: ResourceKey[]
  preHarvestGoodsWantedBeforeReap?: ResourceKey[]
  maySkipHarvestFieldPhase?: boolean
  extraTurnBeforeWorkers?: boolean
}

export type SandboxListenerData = {
  zones?: CardListenerZone[]
  mandatory?: boolean
  preScoring?: boolean
  replacesTurn?: boolean
  blockedAnytimeInteractionKinds?: InteractionRequest['kind'][]
}

function admit<T>(raw: Record<string, unknown>, rules: Record<string, Rule>, label: string, strict: boolean): T {
  const admitted: Record<string, unknown> = {}
  for (const [key, rule] of Object.entries(rules)) {
    const value = raw[key]
    // Only an absent key means the default: `mandatory: null` is a declaration of the wrong type.
    if (value === undefined) continue
    if (rule.matches(value)) admitted[key] = value
    else if (strict) throw new Error(`${label} ${key} must be ${rule.expected}`)
  }
  return admitted as T
}

/** Saving throws on a wrong type; registration of an already saved manifest drops the entry. */
export const admitEffectMetadata = (raw: Record<string, unknown> | undefined, strict: boolean): SandboxEffectMetadata =>
  admit(raw ?? {}, EFFECT_METADATA, 'effect', strict)

export const admitListenerData = (raw: Record<string, unknown>, strict: boolean): SandboxListenerData =>
  admit(raw, LISTENER_DATA_FIELDS, 'listener', strict)
