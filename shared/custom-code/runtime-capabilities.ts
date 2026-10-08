import { SANDBOX_ALLOWED_ACTION_IDS, sandboxActionIdMeta, sandboxSpecialEffectKinds } from './sandbox-action-ids.ts'
import { cardEffectHooks } from '../projections/card-effect-hooks.ts'
import { cardEffectHookMeta } from './sandbox-hook-meta.ts'
import { REAL_RESOURCE_KEYS, isPaymentResourceKey } from '../contract/resource-keys.ts'
import { ALL_ANIMAL_KEYS } from '../contract/animals.ts'
import { assertKeys, assertRecord, sandboxInteractionKinds, sandboxCardMetadataKeys, sandboxCommonActionContextKeys, sandboxFlowFields } from './sandbox-declarations.ts'
import type { ActionFlow, GameState } from '../contract/types.ts'
import type { CardEffectField } from '../cards/card-effects.ts'
import type { CardListenerContext } from '../cards/card-listeners.ts'

const resources = REAL_RESOURCE_KEYS as readonly string[]
const specialKeys: Record<typeof sandboxSpecialEffectKinds[number], readonly string[]> = {
  'increment-counter': ['key', 'amount'], 'set-counter': ['key', 'value'], 'set-flag': ['flag'],
  'increment-extra-data': ['key', 'amount'], 'set-extra-data': ['key', 'value'],
  'pop-card-stack-top': [], 'set-infobox': ['text'], 'remove-future-meeples': ['rounds'],
}

function finite(value: unknown, label: string, nonnegative = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (nonnegative && value < 0)) throw new Error(`${label} must be a finite${nonnegative ? ' nonnegative' : ''} number`)
}
function ownSource(value: unknown, cardId: string): void {
  if (value !== undefined && value !== cardId) throw new Error('Custom output cannot impersonate another source card or Harvest')
}
function safeData(value: unknown, depth = 0): void {
  if (depth > 24) throw new Error('Custom data exceeds the nesting limit')
  if (typeof value === 'number') finite(value, 'Custom number')
  if (Array.isArray(value)) { if (value.length > 512) throw new Error('Custom array exceeds the size limit'); value.forEach(item => safeData(item, depth + 1)) }
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Custom data cannot contain prototype keys')
      safeData(child, depth + 1)
    }
  }
}
function resourceMap(value: unknown, payment = false, nonnegative = true): void {
  assertRecord(value, 'Resources')
  for (const [key, amount] of Object.entries(value)) {
    if (!(payment ? isPaymentResourceKey(key) : resources.includes(key))) throw new Error(`Unsupported resource '${key}'`)
    finite(amount, key, nonnegative)
  }
}
function choiceOptions(value: unknown, cardId: string): void {
  if (!Array.isArray(value)) throw new Error('Choice options must be an array')
  for (const option of value) {
    assertRecord(option, 'Choice option')
    assertKeys(option, ['value', 'labelKey', 'labelParams', 'sourceCard', 'effectPreview', 'descriptionPreview', 'disabled', 'disabledReasonKey'], 'Choice option')
    if (typeof option.value !== 'string' || typeof option.labelKey !== 'string') throw new Error('Choice option requires string value and labelKey')
    ownSource(option.sourceCard, cardId)
  }
}
function bonus(value: unknown, cardId: string): void {
  assertRecord(value, 'Bonus')
  assertKeys(value, ['discount', 'choices', 'capDiscountAtCost', 'trackChoiceIndex', 'choiceAffectsState', 'optional', 'sources', 'conditions', 'minCost', 'maxCost'], 'Bonus')
  for (const key of ['discount', 'minCost', 'maxCost']) if (value[key] !== undefined) resourceMap(value[key])
  if (value.sources !== undefined && (!Array.isArray(value.sources) || value.sources.some(source => source !== cardId))) throw new Error('Bonus sources must belong to this card')
  if (value.choices !== undefined) {
    if (!Array.isArray(value.choices)) throw new Error('Bonus choices must be an array')
    value.choices.forEach(choice => bonus(choice, cardId))
  }
}
function providers(value: unknown, cardId: string): void {
  if (!Array.isArray(value)) throw new Error('Payment providers must be an array')
  for (const provider of value) {
    assertRecord(provider, 'Payment provider')
    assertKeys(provider, ['key', 'sourceCard', 'available', 'covers', 'consume'], 'Payment provider')
    ownSource(provider.sourceCard, cardId); finite(provider.available, 'Provider availability', true)
    if (typeof provider.key !== 'string' || !isPaymentResourceKey(provider.key)) throw new Error('Invalid provider resource key')
    if (!Array.isArray(provider.covers)) throw new Error('Provider covers must be an array')
    for (const cover of provider.covers) {
      assertRecord(cover, 'Provider cover'); assertKeys(cover, ['resource', 'costAmount', 'paymentAmount'], 'Provider cover')
      if (!resources.includes(String(cover.resource))) throw new Error('Invalid provider cover resource')
      finite(cover.costAmount, 'Covered amount', true); finite(cover.paymentAmount, 'Provider amount', true)
    }
    assertRecord(provider.consume, 'Provider consumption')
    assertKeys(provider.consume, ['type', 'spaceId', 'resource'], 'Provider consumption')
    if (provider.consume.type !== 'actionSpace' || typeof provider.consume.spaceId !== 'string' || !resources.includes(String(provider.consume.resource))) throw new Error('Unsupported provider consumption')
  }
}

function trade(value: unknown, cardId: string, declaration = false): void {
  assertRecord(value, 'Trade')
  assertKeys(value, ['from', 'to', 'max', 'fromFarmyard', 'sourceId', 'triggers', 'blockedAnytimeInteractionKinds', ...(declaration ? [] : ['source', 'scope', 'minCost', 'maxCost', 'groupId', 'groupMin', 'groupMax', 'replaceUpTo'])], 'Trade')
  resourceMap(value.from); resourceMap(value.to)
  ownSource(value.sourceId, cardId)
  ownSource(value.source, cardId)
  if (value.max !== undefined) finite(value.max, 'Trade max', true)
  if (value.triggers !== undefined && (!Array.isArray(value.triggers) || value.triggers.some(item => !['anytime', 'harvest', 'bake-bread'].includes(item)))) throw new Error('Unsupported exchange window')
  if (value.blockedAnytimeInteractionKinds !== undefined && (!Array.isArray(value.blockedAnytimeInteractionKinds) || value.blockedAnytimeInteractionKinds.some(item => !(sandboxInteractionKinds as readonly unknown[]).includes(item)))) throw new Error('Unsupported exchange interaction kind')
}

function cost(value: unknown, cardId: string, allowCardReturn = false): void {
  assertRecord(value, 'Cost')
  if (Object.keys(value).every(isPaymentResourceKey)) { resourceMap(value, true); return }
  assertKeys(value, ['fee', 'fees', 'feeIdentities', 'unitFee', 'nb', 'trades', 'bonuses', 'paymentResourceProviders', 'paymentBudget', 'minimumResourcesPaid', 'resourceReserve', ...(allowCardReturn ? ['cards'] : [])], 'Cost')
  for (const key of ['fee', 'unitFee', 'paymentBudget', 'minimumResourcesPaid']) if (value[key] !== undefined) resourceMap(value[key], true)
  if (value.fees !== undefined) {
    if (!Array.isArray(value.fees)) throw new Error('Cost fees must be an array')
    value.fees.forEach(fee => resourceMap(fee, true))
  }
  if (value.nb !== undefined) finite(value.nb, 'Cost unit count', true)
  if (value.trades !== undefined) {
    if (!Array.isArray(value.trades)) throw new Error('Cost trades must be an array')
    value.trades.forEach(item => trade(item, cardId))
  }
  if (value.bonuses !== undefined) { if (!Array.isArray(value.bonuses)) throw new Error('Cost bonuses must be an array'); value.bonuses.forEach(item => bonus(item, cardId)) }
  if (value.paymentResourceProviders !== undefined) providers(value.paymentResourceProviders, cardId)
  if (value.cards !== undefined) {
    assertRecord(value.cards, 'Card-return cost')
    assertKeys(value.cards, ['type', 'list', 'cost', 'required'], 'Card-return cost')
    if (typeof value.cards.type !== 'string' || !Array.isArray(value.cards.list) || value.cards.list.some(id => typeof id !== 'string')) throw new Error('Invalid card-return cost')
    if (value.cards.cost !== undefined) resourceMap(value.cards.cost, true)
    if (value.cards.required !== undefined && typeof value.cards.required !== 'boolean') throw new Error('Card-return required must be boolean')
  }
}

export function assertCustomCardDefinition(definition: unknown, cardId: string): void {
  assertRecord(definition, 'CARD_DEF')
  const meta = 'meta' in definition ? definition.meta : definition
  assertRecord(meta, 'CARD_DEF.meta')
  safeData(meta)
  assertKeys(meta, sandboxCardMetadataKeys, 'CARD_DEF.meta')
  if (meta.id !== cardId) throw new Error('CARD_DEF id must match CARD_ID')
  if (meta.cost !== undefined) cost(meta.cost, cardId, true)
  if (meta.altCosts !== undefined) {
    if (!Array.isArray(meta.altCosts)) throw new Error('altCosts must be an array')
    meta.altCosts.forEach(item => cost(item, cardId, true))
  }
  if (meta.exchanges !== undefined) {
    if (!Array.isArray(meta.exchanges)) throw new Error('exchanges must be an array')
    meta.exchanges.forEach(item => trade(item, cardId, true))
  }
  if (meta.modifiers !== undefined && !Array.isArray(meta.modifiers)) throw new Error('modifiers must be an array')
  for (const modifier of [...(Array.isArray(meta.modifiers) ? meta.modifiers : []), ...(meta.modifier !== undefined ? [meta.modifier] : [])]) {
    assertRecord(modifier, 'Cost modifier')
    assertKeys(modifier, ['type', 'cardId', 'appliesTo', 'from', 'to', 'max', 'scope', 'groupId', 'groupMin', 'groupMax', 'replaceUpTo', 'minCost', 'maxCost', 'conditions', 'discount', 'choices', 'capDiscountAtCost', 'trackChoiceIndex', 'choiceAffectsState', 'optional', 'resources'], 'Cost modifier')
    if (modifier.cardId !== cardId) throw new Error('Cost modifier cardId must be this card')
    if (!['trade', 'bonus', 'remove-resource'].includes(String(modifier.type))) throw new Error('Unsupported cost modifier')
    if (!Array.isArray(modifier.appliesTo) || modifier.appliesTo.some(type => !['construct', 'renovation', 'occupation', 'fencing', 'stables', 'plow', 'major-improvement', 'minor-improvement'].includes(type))) throw new Error('Unsupported modifier cost type')
    if (modifier.type === 'trade') trade(Object.fromEntries(Object.entries(modifier).filter(([key]) => !['type', 'cardId', 'appliesTo', 'conditions'].includes(key))), cardId)
    if (modifier.type === 'bonus') bonus(Object.fromEntries(Object.entries(modifier).filter(([key]) => !['type', 'cardId', 'appliesTo'].includes(key))), cardId)
  }

}

export function assertCustomActionData(actionId: string, params: Record<string, unknown>, context: Record<string, unknown>, cardId: string): void {
  if (!(SANDBOX_ALLOWED_ACTION_IDS as readonly string[]).includes(actionId)) throw new Error(`Unsupported Workshop action '${actionId}'`)
  const descriptor = sandboxActionIdMeta[actionId as keyof typeof sandboxActionIdMeta]
  const paramKeys = descriptor.paramKeys ?? []
  assertKeys(params, paramKeys, `${actionId}.params`)
  assertKeys(context, [...sandboxCommonActionContextKeys, ...descriptor.contextKeys], `${actionId}.actionContext`)
  ownSource(context.sourceCard, cardId)
  if (context.trueAction !== undefined && typeof context.trueAction !== 'boolean') throw new Error('trueAction must be boolean')
  if (params.sourceActionId !== undefined && !(SANDBOX_ALLOWED_ACTION_IDS as readonly unknown[]).includes(params.sourceActionId)) throw new Error('Unsupported logical action source')
  if (params.actionContext !== undefined) {
    assertRecord(params.actionContext, 'params.actionContext')
    const nestedParams = Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'actionContext'))
    assertCustomActionData(actionId, nestedParams, params.actionContext, cardId)
  }
  for (const exact of [context.exactCost, params.exactCost]) if (exact !== undefined) {
    assertRecord(exact, 'Exact cost')
    resourceMap(Object.fromEntries(Object.entries(exact).filter(([key]) => key !== 'max')), true)
    if (exact.max !== undefined) finite(exact.max, 'Exact cost maximum', true)
  }
  if (context.costOverride !== undefined) resourceMap(context.costOverride, false, false)
  if (actionId === 'pay') cost(params.cost ?? params, cardId)
  if (actionId === 'pay' && params.reserveResources !== undefined) resourceMap(params.reserveResources)
  if (['gain', 'store-on-card', 'take-from-card'].includes(actionId)) resourceMap(Object.fromEntries(Object.entries(params).filter(([key]) => resources.includes(key))))
  if (actionId === 'special-effect') {
    if (!(sandboxSpecialEffectKinds as readonly unknown[]).includes(params.kind)) throw new Error(`Unsupported special-effect kind '${String(params.kind)}'`)
    assertKeys(params, ['kind', ...specialKeys[params.kind as keyof typeof specialKeys]], 'special-effect')
    if (specialKeys[params.kind as keyof typeof specialKeys].includes('key') && (typeof params.key !== 'string' || !params.key || ['__proto__', 'constructor', 'prototype'].includes(params.key))) throw new Error('Invalid card-local key')
    if (specialKeys[params.kind as keyof typeof specialKeys].includes('amount')) finite(params.amount, 'Local amount')
    if (params.kind === 'set-counter') finite(params.value, 'Local counter')
    if (params.kind === 'set-flag' && typeof params.flag !== 'boolean') throw new Error('Flag must be boolean')
    if (params.kind === 'set-infobox' && typeof params.text !== 'string') throw new Error('Infobox must be text')
    if (params.kind === 'set-extra-data' && !Object.hasOwn(params, 'value')) throw new Error('set-extra-data requires a JSON value')
    if (params.rounds !== undefined && (!Array.isArray(params.rounds) || params.rounds.some(round => !Number.isInteger(round) || round < 1 || round > 14))) throw new Error('Future cancellation rounds must be from 1 to 14')
  }
  if (actionId === 'future-meeples') {
    const request = params.__futureMeepleRequest
    assertRecord(request, 'Future request')
    ownSource(request.cardId, cardId)
    assertKeys(request, ['cardId', 'playerId', 'startRound', 'count', 'resources', 'entries', 'actionContext'], 'Future request')
    if (request.cardId !== cardId || typeof request.playerId !== 'string') throw new Error('Future request requires this card and a player ID')
    if (request.entries !== undefined && !Array.isArray(request.entries)) throw new Error('Future entries must be an array')
    if (request.entries === undefined) { finite(request.startRound, 'Future start round', true); finite(request.count, 'Future count', true) }
    const entries = Array.isArray(request.entries) ? request.entries : [request]
    for (const entry of entries) {
      assertRecord(entry, 'Future entry')
      if (request.entries !== undefined) assertKeys(entry, ['round', 'resources', 'roomType', 'actionContext'], 'Future entry')
      if (request.entries !== undefined && (!Number.isInteger(entry.round) || Number(entry.round) < 1 || Number(entry.round) > 14)) throw new Error('Future entry requires a round from 1 to 14')
      if (entry.resources !== undefined) {
        assertRecord(entry.resources, 'Future resources')
        assertKeys(entry.resources, [...resources, 'field', 'stable'], 'Future resources')
        Object.values(entry.resources).forEach(amount => finite(amount, 'Future amount', true))
      }
      if (entry.roomType !== undefined && !['wood', 'clay', 'stone'].includes(String(entry.roomType))) throw new Error('Invalid future room type')
      if (entry.actionContext !== undefined || request.actionContext !== undefined) throw new Error('Future action-context overrides require a separate admitted settlement contract')
    }
  }
  if (actionId === 'sow') {
    if (context.cropType !== undefined && !['grain', 'vegetable'].includes(String(context.cropType))) throw new Error('Workshop sow supports ordinary crops')
    if (params.crops !== undefined && (!Array.isArray(params.crops) || params.crops.some(crop => !crop || !['grain', 'vegetable'].includes(String(crop.crop))))) throw new Error('Workshop sow supports ordinary crop selections')
  }
  if (actionId === 'selection' && (context.selectionKind !== undefined && context.selectionKind !== 'farm-position' || !Array.isArray(context.selectableTiles))) throw new Error('Selection requires explicit farm-position candidates')
  if (actionId === 'emit-choice') choiceOptions(params.options, cardId)
  if (actionId === 'reorganize' && context.trigger !== undefined && context.trigger !== 'anytime') throw new Error('Custom reorganization cannot impersonate Harvest/round end')
  if (actionId === 'reap') {
    assertRecord(context.trigger, 'Reap trigger')
    assertKeys(context.trigger, ['phase', 'actionId', 'cardId'], 'Reap trigger')
    if (context.trigger.phase !== 'private-field-phase') throw new Error('Custom reap must use private-field-phase')
    ownSource(context.trigger.cardId, cardId)
  }
  if (actionId === 'exchange' && context.directTrade !== undefined) trade(context.directTrade, cardId)
  if (actionId === 'fence' && context.fencePolicy !== undefined) {
    assertRecord(context.fencePolicy, 'Fence policy')
    assertKeys(context.fencePolicy, ['segmentBounds', 'newPastureBounds', 'cancelPolicy'], 'Ordinary fence policy')
    if (context.fencePolicy.segmentBounds !== undefined) {
      assertRecord(context.fencePolicy.segmentBounds, 'Fence segment bounds')
      assertKeys(context.fencePolicy.segmentBounds, ['fence', 'total'], 'Ordinary segment bounds')
    }
  }
}

export function validateCustomFlow(value: unknown, cardId: string, depth = 0): ActionFlow {
  if (depth > 24) throw new Error('Custom flow exceeds the nesting limit')
  assertRecord(value, 'ActionFlow')
  ownSource(value.sourceCard, cardId)
  if (value.anytimeWindow !== undefined) {
    assertRecord(value.anytimeWindow, 'Anytime window')
    assertKeys(value.anytimeWindow, ['allowed', 'blockedIds'], 'Anytime window')
    if (typeof value.anytimeWindow.allowed !== 'boolean' || value.anytimeWindow.blockedIds !== undefined && (!Array.isArray(value.anytimeWindow.blockedIds) || value.anytimeWindow.blockedIds.some(id => typeof id !== 'string'))) throw new Error('Invalid anytime window declaration')
  }
  const leaf = value.type === 'leaf'
  assertKeys(value, leaf ? sandboxFlowFields.leaf : sandboxFlowFields.composite, 'ActionFlow')
  if (leaf) {
    if (typeof value.actionId !== 'string') throw new Error('ActionFlow requires an action ID')
    const params = value.params ?? {}; const context = value.actionContext ?? {}
    assertRecord(params, 'Flow params'); assertRecord(context, 'Flow actionContext')
    assertCustomActionData(value.actionId, params, context, cardId)
    value.sourceCard ??= cardId
  } else if (!['seq', 'or', 'xor', 'parallel'].includes(String(value.type)) || !Array.isArray(value.children)) throw new Error('Composite ActionFlow requires supported type and children')
  else value.children.forEach(child => validateCustomFlow(child, cardId, depth + 1))
  safeData(value)
  return value as ActionFlow
}

/** Required native queries need neutral data when a sandbox hook is skipped. */
export function customEffectFallback(hook: string): unknown {
  if (['computeCostedBonus', 'computeSharedPostScore', 'computeLockedFarmTiles', 'getBuiltSpecialStables', 'getInvalidAnimals', 'computeResourceCommitments'].includes(hook)) return []
  if (['computeBonusScore', 'computeExtraRoomCapacity', 'countExtraTurns'].includes(hook)) return 0
  if (hook === 'enforceReorganizeOnLastHarvest') return false
  return undefined
}

export function validateCustomEffectResult(value: unknown, cardId: string, hook: string, args: unknown[]): unknown {
  if (!(cardEffectHooks as readonly string[]).includes(hook)) throw new Error(`Unsupported effect hook '${hook}'`)
  if (value === null || value === undefined) return customEffectFallback(hook) ?? null
  safeData(value)
  const metadata = cardEffectHookMeta[hook as CardEffectField]
  if ((metadata.table === 'effect' && hook !== 'onBeforePlayerTurn') || hook === 'resolveChoice') return validateCustomFlow(value, cardId)
  if (hook === 'onBeforePlayerTurn') { assertRecord(value, hook); assertKeys(value, ['skipTurn'], hook); if (value.skipTurn !== true && value.skipTurn !== false) throw new Error('skipTurn must be boolean'); return value }
  if (['computeBonusScore', 'computeExtraRoomCapacity', 'computeHarvestBreedOrderPriority', 'countExtraTurns', 'computeBreedThreshold', 'computeBreedableAnimalCount', 'computeAnimalScoreAdjustment'].includes(hook)) finite(value, hook, ['countExtraTurns', 'computeBreedThreshold', 'computeBreedableAnimalCount'].includes(hook))
  if (hook === 'countExtraTurns' && !Number.isInteger(value)) throw new Error('countExtraTurns must be an integer')
  if (hook === 'computeCostedBonus') {
    if (!Array.isArray(value)) throw new Error('Costed bonus must be an array')
    for (const level of value) {
      assertRecord(level, 'Bonus level'); assertKeys(level, ['cost', 'score'], 'Bonus level')
      resourceMap(level.cost); finite(level.score, 'Bonus score')
    }
  }
  if (hook === 'computeSharedPostScore') {
    if (!Array.isArray(value)) throw new Error('Shared score must be an array')
    const players = (args[0] as GameState)?.players ?? []
    for (const entry of value) {
      assertRecord(entry, 'Shared score'); assertKeys(entry, ['playerId', 'score'], 'Shared score')
      if (!players.some(player => player.id === entry.playerId)) throw new Error('Shared score player not found')
      finite(entry.score, 'Shared score')
    }
  }
  if (hook === 'computeLockedFarmTiles' || hook === 'getBuiltSpecialStables') {
    if (!Array.isArray(value)) throw new Error('Farm positions must be an array')
    for (const position of value) {
      assertRecord(position, 'Farm position'); assertKeys(position, ['row', 'col'], 'Farm position')
      finite(position.row, 'Farm row'); finite(position.col, 'Farm column')
    }
  }
  if (hook === 'getInvalidAnimals') {
    if (!Array.isArray(value)) throw new Error('Invalid animals must be an array')
    const remaining = [...(args[2] as Array<{ type: string }> ?? [])]
    for (const animal of value) {
      assertRecord(animal, 'Invalid animal'); assertKeys(animal, ['type'], 'Invalid animal')
      const index = remaining.findIndex(input => input.type === animal.type)
      if (!(ALL_ANIMAL_KEYS as readonly unknown[]).includes(animal.type) || index < 0) throw new Error('Invalid animals must be a subset of input meeples')
      remaining.splice(index, 1)
    }
  }
  if (hook === 'getRuleContributions') {
    assertRecord(value, 'Rule contributions'); assertKeys(value, ['reservedSupply', 'unusedSpaceReduction'], 'Rule contributions')
    if (value.reservedSupply !== undefined) {
      assertRecord(value.reservedSupply, 'Reserved supply'); assertKeys(value.reservedSupply, ['fence', 'stable'], 'Reserved supply')
      Object.values(value.reservedSupply).forEach(amount => finite(amount, 'Reserved supply', true))
    }
    if (value.unusedSpaceReduction !== undefined) finite(value.unusedSpaceReduction, 'Unused-space reduction', true)
  }
  if (hook === 'getStatePresentation') {
    assertRecord(value, 'State presentation')
    // The existing host projection closes and normalizes the public wire
    // fields, dropping private data; keep that established projection seam.
  }
  if (hook === 'enforceReorganizeOnLastHarvest' && typeof value !== 'boolean') throw new Error(`${hook} must return boolean`)
  if (hook === 'computeResourceCommitments') {
    if (!Array.isArray(value)) throw new Error('Resource commitments must be an array')
    const players = (args[0] as GameState)?.players ?? []
    for (const entry of value) {
      assertRecord(entry, 'Commitment'); assertKeys(entry, ['playerId', 'resources'], 'Commitment')
      if (!players.some(player => player.id === entry.playerId)) throw new Error('Commitment player not found')
      resourceMap(entry.resources)
    }
  }
  if (hook === 'onComputeAnimalZones' || hook === 'onComputeSharedAnimalZones') {
    if (!Array.isArray(value)) throw new Error('Animal-zone query must return new zones')
    const existing = args[hook === 'onComputeSharedAnimalZones' ? 2 : 1] as Array<{ id: string }>
    const seen = new Set((existing ?? []).map(zone => zone.id))
    for (const zone of value) {
      assertRecord(zone, 'Animal zone'); ownSource(zone.cardId, cardId)
      if (zone.zoneType !== 'card' || typeof zone.id !== 'string' || seen.has(zone.id)) throw new Error('Animal query must return distinct new card zones')
      seen.add(zone.id); finite(zone.capacity, 'Animal capacity', true)
      const owner = args[0] as { id: string }
      const animalOwner = (hook === 'onComputeSharedAnimalZones' ? args[1] : args[0]) as { id: string }
      if (zone.ownerPlayerId !== undefined && zone.ownerPlayerId !== owner?.id || zone.animalOwnerPlayerId !== undefined && zone.animalOwnerPlayerId !== animalOwner?.id) throw new Error('Animal-zone owners must match the query players')
    }
  }
  return value
}

export function assertCustomListenerCapabilities(value: unknown, cardId: string, context?: CardListenerContext): void {
  if (value === null || value === undefined) return
  assertRecord(value, 'Listener result'); safeData(value); ownSource(value.sourceCard, cardId)
  assertKeys(value, ['doable', 'actionId', 'extraData', 'extraOptions', 'extraExchanges', 'followUpActions', 'flow', 'costs', 'costAttribution', 'reserveResources', 'trades', 'bonuses', 'paymentResourceProviders', 'sourceCard', 'countCardUse', 'labelKey', 'labelParams', 'decline', 'alternativeFlow'], 'Listener result')
  for (const key of ['flow', 'alternativeFlow']) if (value[key] !== undefined) validateCustomFlow(value[key], cardId)
  if (value.extraOptions !== undefined) choiceOptions(value.extraOptions, cardId)
  if (value.actionId !== undefined && !(SANDBOX_ALLOWED_ACTION_IDS as readonly unknown[]).includes(value.actionId)) throw new Error('Unsupported replacement action')
  if (value.actionId !== undefined) assertCustomActionData(String(value.actionId), {}, (value.extraData ?? {}) as Record<string, unknown>, cardId)
  if (value.followUpActions !== undefined) {
    if (!Array.isArray(value.followUpActions)) throw new Error('followUpActions must be an array')
    for (const action of value.followUpActions) {
      const id = typeof action === 'string' ? action : action?.actionId
      if (!(SANDBOX_ALLOWED_ACTION_IDS as readonly unknown[]).includes(id)) throw new Error('Unsupported follow-up action')
      if (typeof action === 'object' && action) ownSource(action.sourceCard, cardId)
      assertCustomActionData(String(id), {}, {}, cardId)
      if (typeof action === 'object' && action) { assertRecord(action, 'Follow-up'); assertKeys(action, ['actionId', 'sourceCard'], 'Follow-up') }
    }
  }
  if (value.bonuses !== undefined) { if (!Array.isArray(value.bonuses)) throw new Error('Listener bonuses must be an array'); value.bonuses.forEach(item => bonus(item, cardId)) }
  if (value.paymentResourceProviders !== undefined) providers(value.paymentResourceProviders, cardId)
  if (value.reserveResources !== undefined) resourceMap(value.reserveResources)
  for (const key of ['extraExchanges', 'trades']) if (value[key] !== undefined) {
    if (!Array.isArray(value[key])) throw new Error(`${key} must be an array`)
    value[key].forEach(item => trade(item, cardId, key === 'extraExchanges'))
  }
  if (value.extraData !== undefined) {
    assertRecord(value.extraData, 'Listener extraData')
    if (Object.keys(value.extraData).length) assertCustomActionData(String(value.actionId ?? context?.actionId ?? ''), {}, value.extraData, cardId)
  }
}
