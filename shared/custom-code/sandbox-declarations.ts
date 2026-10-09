import { cardEffectHooks } from '../projections/card-effect-hooks.ts'
import { REAL_RESOURCE_KEYS } from '../contract/resource-keys.ts'
import { sandboxListenerActions } from './sandbox-listener-actions.ts'
import { sandboxListenerPhases } from './sandbox-listener-phases.ts'
import { sandboxListenerScopes } from './sandbox-listener-scopes.ts'
import { cardEffectHookMeta } from './sandbox-hook-meta.ts'
import type { CustomCodeManifest, CustomCodeEffectMetadata, CustomCodeListenerManifest } from './types.ts'
import type { CardEffectField } from '../cards/card-effects.ts'

export const sandboxCardMetadataKeys = ['id', 'name', 'deck', 'number', 'category', 'desc', 'rules', 'cost', 'altCosts', 'vp', 'prerequisite', 'occupationPrerequisites', 'improvementPrerequisites', 'players', 'passing', 'exchanges', 'modifier', 'modifiers', 'implemented', 'isCookery', 'isBaking', 'isField', 'providesField', 'providesOccupation', 'artUrl', 'locales', 'returnCards', 'maxRound', 'extraVp', 'evenMoreSet', 'playerActionCardType', 'card_type'] as const
export const sandboxCommonActionContextKeys = ['sourceCard', 'trueAction'] as const
export const sandboxFlowFields = {
  leaf: ['type', 'optional', 'promptKey', 'sourceCard', 'targetPlayerId', 'optionId', 'choiceLabelKey', 'choiceLabelParams', 'anytimeWindow', 'actionId', 'params', 'actionContext', 'effectPreview'],
  composite: ['type', 'optional', 'promptKey', 'sourceCard', 'targetPlayerId', 'optionId', 'choiceLabelKey', 'choiceLabelParams', 'anytimeWindow', 'children', 'mode', 'triggerSelectOnce'],
} as const

export const sandboxEffectMetadata = {
  handHooks: 'Supported stage hooks dispatched from hand; exclude onBuy/onEndTurn/onBeforeEndGame/onBeforePlayerTurn/contributeExtraTurn.',
  beforeEndGameScope: 'owner | allPlayers: targets of this card before end-game scoring.',
  beforeEndGameMandatory: 'boolean: mandatory before-end activation, still subject to native doability.',
  preHarvestGoodsWanted: 'ResourceKey[]: goods required before Harvest, including guaranteed reaping.',
  preHarvestGoodsWantedBeforeReap: 'ResourceKey[]: goods required before reaping, from current supply only.',
  maySkipHarvestFieldPhase: 'boolean: existing Harvest field-phase skip eligibility.',
  extraTurnBeforeWorkers: 'boolean: extra-turn provider also offered before ordinary workers; pair with contributeExtraTurn.',
} as const satisfies Record<keyof CustomCodeEffectMetadata, string>

export const sandboxListenerFields = {
  cardIds: 'Bound to [CARD_ID]; omitted means this card, never a global listener.',
  actions: 'Supported action IDs; omitted means the explicit deployed set.',
  phases: 'Supported phases; omitted means the explicit deployed set.',
  order: 'Finite numeric ordering hint under the native dispatcher.',
  scope: 'player | opponent | any; defaults to player.',
  zones: 'played | hand; defaults to played.',
  mandatory: 'boolean: native mandatory reaction semantics.',
  preScoring: 'boolean: offer this anytime ability in the pre-scoring window.',
  replacesTurn: 'boolean: an idle-work-phase anytime ability replaces the current turn opportunity.',
  blockedAnytimeInteractionKinds: 'Interaction kinds in which this anytime ability must not be offered.',
} as const

export const sandboxInteractionKinds = ['choice', 'selection', 'farm-select', 'animal-reorg', 'feed', 'heating', 'confirm-next-player', 'confirm-player-switch', 'card-draft', 'select-trigger', 'engine-blocked', 'resource-quantity-select', 'resource-batch-exchange-select'] as const
export const sandboxHandHooks = cardEffectHooks.filter(hook => cardEffectHookMeta[hook].table === 'effect'
  && !['onBuy', 'onEndTurn', 'onBeforeEndGame', 'onBeforePlayerTurn', 'contributeExtraTurn'].includes(hook))

/** Both executors run this exact postlude; callable fields are captured by name,
 * while declarative values remain data and are checked on the host. */
export const MANIFEST_EXTRACTION_SOURCE = `
var __effectKeys = [];
var __effectMetadata = {};
var __listeners = [];
var __metadataKeys = ${JSON.stringify(Object.keys(sandboxEffectMetadata))};
var __listenerKeys = ${JSON.stringify(Object.keys(sandboxListenerFields))};
if (__captured.CARD_IMPL && __captured.CARD_IMPL.effect) {
  var eff = __captured.CARD_IMPL.effect;
  for (var k in eff) {
    if (Object.prototype.hasOwnProperty.call(eff, k) && typeof eff[k] === 'function') __effectKeys.push(k);
  }
  for (var m = 0; m < __metadataKeys.length; m++) {
    var mk = __metadataKeys[m];
    if (Object.prototype.hasOwnProperty.call(eff, mk)) __effectMetadata[mk] = eff[mk];
  }
}
if (__captured.CARD_IMPL && Array.isArray(__captured.CARD_IMPL.listeners)) {
  for (var i = 0; i < __captured.CARD_IMPL.listeners.length; i++) {
    var listener = __captured.CARD_IMPL.listeners[i];
    var entry = { registrationId: __sandbox_card_id + ':listener:' + i };
    for (var j = 0; j < __listenerKeys.length; j++) {
      var lk = __listenerKeys[j];
      if (Object.prototype.hasOwnProperty.call(listener, lk)) entry[lk] = listener[lk];
    }
    __listeners.push(entry);
  }
}
`

export function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
}
export function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unsupported = Object.keys(value).find(key => !allowed.includes(key))
  if (unsupported) throw new Error(`${label}: unsupported field '${unsupported}'`)
}
function stringSet(value: unknown, allowed: readonly string[], label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || !allowed.includes(item))) {
    throw new Error(`${label} must contain supported values`)
  }
  return [...new Set(value as string[])]
}

export function normalizeCustomManifest(manifest: CustomCodeManifest, cardId: string): CustomCodeManifest {
  const effectHooks = manifest.effectHooks.length ? stringSet(manifest.effectHooks, cardEffectHooks, 'effect hooks') as CardEffectField[] : []
  const metadata = manifest.effectMetadata
  if (metadata) {
    assertKeys(metadata, Object.keys(sandboxEffectMetadata), 'effect metadata')
    for (const [key, value] of Object.entries(metadata)) {
      if (key === 'handHooks') { if (!Array.isArray(value)) throw new Error('handHooks must be an array'); if (value.length) stringSet(value, sandboxHandHooks, key) }
      else if (key === 'beforeEndGameScope') stringSet([value], ['owner', 'allPlayers'], key)
      else if (key === 'preHarvestGoodsWanted' || key === 'preHarvestGoodsWantedBeforeReap') {
        if (!Array.isArray(value) || value.some(item => !(REAL_RESOURCE_KEYS as readonly unknown[]).includes(item))) throw new Error(`${key} must be resource names`)
      } else if (typeof value !== 'boolean') throw new Error(`${key} must be boolean`)
    }
  }
  const listeners = manifest.listeners.map((listener, index): CustomCodeListenerManifest => {
    assertKeys(listener, ['registrationId', ...Object.keys(sandboxListenerFields)], 'listener')
    if (listener.registrationId !== `${cardId}:listener:${index}`) throw new Error('Listener registration belongs to another card')
    if (listener.cardIds !== undefined) stringSet(listener.cardIds, [cardId], 'listener.cardIds')
    if (listener.order !== undefined && !Number.isFinite(listener.order)) throw new Error('listener.order must be finite')
    for (const key of ['mandatory', 'preScoring', 'replacesTurn'] as const) {
      if (listener[key] !== undefined && typeof listener[key] !== 'boolean') throw new Error(`listener.${key} must be boolean`)
    }
    if (listener.blockedAnytimeInteractionKinds !== undefined) {
      if (!Array.isArray(listener.blockedAnytimeInteractionKinds)) throw new Error('blockedAnytimeInteractionKinds must be an array')
      if (listener.blockedAnytimeInteractionKinds.length) stringSet(listener.blockedAnytimeInteractionKinds, sandboxInteractionKinds, 'blockedAnytimeInteractionKinds')
    }
    return {
      ...listener, cardIds: [cardId],
      actions: listener.actions === undefined ? [...sandboxListenerActions] : stringSet(listener.actions, sandboxListenerActions, 'listener.actions'),
      phases: listener.phases === undefined ? [...sandboxListenerPhases] : stringSet(listener.phases, sandboxListenerPhases, 'listener.phases') as CustomCodeListenerManifest['phases'],
      scope: listener.scope === undefined ? 'player' : stringSet([listener.scope], sandboxListenerScopes, 'listener.scope')[0] as CustomCodeListenerManifest['scope'],
      zones: listener.zones === undefined ? ['played'] : stringSet(listener.zones, ['played', 'hand'], 'listener.zones') as CustomCodeListenerManifest['zones'],
    }
  })
  return { effectHooks, ...(metadata && Object.keys(metadata).length ? { effectMetadata: metadata } : {}), listeners }
}

/** Existing constructor occupation shorthand, normalized before metadata admission. */
export const CARD_DEFINITION_NORMALIZATION_SOURCE = `
function __normalizeCardPrerequisite(def) {
  var prerequisite = def && def.prerequisite;
  if (!prerequisite || typeof prerequisite !== 'object' || Array.isArray(prerequisite)) return def;
  var keys = Object.keys(prerequisite);
  if (keys.length !== 1 || keys[0] !== 'occupation') return def;
  var count = prerequisite.occupation;
  if (!Number.isSafeInteger(count) || count < 0) return def;
  var normalized = Object.assign({}, def, { prerequisite: count + ' Occupations' });
  if (def.occupationPrerequisites === undefined) normalized.occupationPrerequisites = { min: count };
  return normalized;
}
`
