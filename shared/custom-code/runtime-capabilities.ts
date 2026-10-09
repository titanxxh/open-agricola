import { SANDBOX_ALLOWED_ACTION_IDS, sandboxActionIdMeta, sandboxSpecialEffectKinds } from './sandbox-action-ids.ts'
import { cardEffectHooks } from '../projections/card-effect-hooks.ts'
import { cardEffectHookMeta } from './sandbox-hook-meta.ts'
import { REAL_RESOURCE_KEYS, isPaymentResourceKey, isCardProvidedPaymentResourceKey } from '../contract/resource-keys.ts'
import { validateBonus, validateTradeModifier, assertPaymentProviderEnumerationBudget, MAX_PAYMENT_PROVIDER_COMBINATIONS } from '../actions/payment/declaration-validation.ts'
import { getFarmyardTilePositions, positionKey } from '../domain/farmyard-geometry.ts'
import { ALL_ANIMAL_KEYS, animalKeysForState } from '../contract/animals.ts'
import { assertKeys, assertRecord, sandboxInteractionKinds, sandboxCardMetadataKeys, sandboxCommonActionContextKeys, sandboxFlowFields } from './sandbox-declarations.ts'
import type { ActionFlow, Bonus, CardProvidedPaymentResourceProvider, GameState, TradeModifier } from '../contract/types.ts'
import type { CardEffectField } from '../cards/card-effects.ts'
import type { CardListenerContext } from '../cards/card-listeners.ts'
import { COST_MODIFIER_TYPES } from '../contract/types.ts'

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
function resourceMap(value: unknown, payment = false, nonnegative = true): asserts value is Record<string, number> {
  assertRecord(value, 'Resources')
  for (const [key, amount] of Object.entries(value)) {
    if (!(payment ? isPaymentResourceKey(key) : resources.includes(key))) throw new Error(`Unsupported resource '${key}'`)
    finite(amount, key, nonnegative)
    if (!Number.isSafeInteger(amount)) throw new Error(`${key} must be a safe integer`)
  }
}
function stringArray(value: unknown, label: string, allowed?: readonly string[], nonempty = false): asserts value is string[] {
  if (!Array.isArray(value) || nonempty && value.length === 0 || value.some(item => typeof item !== 'string' || !item || allowed && !allowed.includes(item))) throw new Error(`${label} must be an array of supported strings`)
}
function integer(value: unknown, label: string): asserts value is number {
  finite(value, label, true)
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer within the safe range`)
}
function bounds(value: unknown, label = 'Prerequisite'): void {
  assertRecord(value, label); assertKeys(value, ['min', 'max'], label)
  for (const key of ['min', 'max']) if (value[key] !== undefined) integer(value[key], `${label} ${key}`)
  if (value.min !== undefined && value.max !== undefined && Number(value.min) > Number(value.max)) throw new Error(`${label} min cannot exceed max`)
}
function farmPositions(value: unknown, state?: GameState, playerId?: string): number {
  if (!Array.isArray(value)) throw new Error('Farm candidates must be an array')
  const player = state?.players?.find(player => player.id === playerId) ?? state?.players?.[state.currentPlayerIndex ?? 0]
  const available = new Set(getFarmyardTilePositions(player).map(positionKey)), seen = new Set<string>()
  for (const position of value) {
    assertRecord(position, 'Farm candidate'); assertKeys(position, ['row', 'col'], 'Farm candidate')
    finite(position.row, 'Farm row'); finite(position.col, 'Farm column')
    if (!Number.isInteger(position.row) || !Number.isInteger(position.col)) throw new Error('Farm coordinates must be integers')
    const key = positionKey({row:position.row,col:position.col})
    if (!available.has(key) || seen.has(key)) throw new Error('Farm candidates must be distinct positions of the target farm')
    seen.add(key)
  }
  return seen.size
}
function choiceOptions(value: unknown, cardId: string): void {
  if (!Array.isArray(value)) throw new Error('Choice options must be an array')
  for (const option of value) {
    assertRecord(option, 'Choice option')
    assertKeys(option, ['value', 'labelKey', 'labelParams', 'sourceCard', 'effectPreview', 'descriptionPreview', 'disabled', 'disabledReasonKey'], 'Choice option')
    if (typeof option.value !== 'string' || typeof option.labelKey !== 'string') throw new Error('Choice option requires string value and labelKey')
    if (option.disabled !== undefined && typeof option.disabled !== 'boolean') throw new Error('Choice disabled must be boolean')
    if (option.labelParams !== undefined) assertRecord(option.labelParams, 'Choice label params')
    if (option.disabledReasonKey !== undefined && typeof option.disabledReasonKey !== 'string') throw new Error('Choice disabled reason must be a string')
    if (option.effectPreview !== undefined) effectPreview(option.effectPreview)
    if (option.descriptionPreview !== undefined) descriptionPreview(option.descriptionPreview)
    ownSource(option.sourceCard, cardId)
  }
}
function previewString(value: unknown, label: string): void {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
}
function previewLocation(value: unknown): void {
  assertRecord(value, 'Preview location')
  if (value.kind === 'player') assertKeys(value, ['kind'], 'Preview location')
  else if (value.kind === 'card') {
    assertKeys(value, ['kind', 'cardId'], 'Preview location'); previewString(value.cardId, 'Preview card ID')
  } else if (value.kind === 'actionSpace') {
    assertKeys(value, ['kind', 'spaceId', 'nameKey'], 'Preview location'); previewString(value.spaceId, 'Preview space ID'); previewString(value.nameKey, 'Preview name key')
  } else throw new Error('Unsupported preview location')
}
function previewRound(value: unknown): asserts value is number {
  integer(value, 'Preview round')
  if (value < 1 || value > 14) throw new Error('Preview round must be from 1 to 14')
}
function effectPreview(value: unknown): void {
  assertRecord(value, 'Effect preview')
  const fields: Record<string, string[]> = {
    fieldContents:['resources','sourceCard'], cardScore:['cardId','delta'], actionSpace:['spaceId','nameKey','descriptionKey'],
    futureOffers:['entries'], futureSchedule:['entries'], resourceMovement:['resources','from','to'],
    resourceExchange:['resourcesPaid','resourcesGained','bonusVp'], payment:['resourcesPaid','cardUsed','sourceCards'], text:['text'],
  }
  if (typeof value.kind !== 'string' || !Object.hasOwn(fields, value.kind)) throw new Error('Unsupported effect preview kind')
  assertKeys(value, ['kind', ...fields[value.kind]!], 'Effect preview')
  for (const key of ['resources', 'resourcesGained']) if (value[key] !== undefined) resourceMap(value[key])
  if (value.resourcesPaid !== undefined) resourceMap(value.resourcesPaid, true)
  if (['fieldContents','resourceMovement'].includes(value.kind)) resourceMap(value.resources)
  if (value.kind === 'fieldContents' && value.sourceCard !== undefined) previewString(value.sourceCard, 'Preview source card')
  if (value.kind === 'cardScore') { previewString(value.cardId, 'Preview card ID'); finite(value.delta, 'Preview score delta') }
  if (value.kind === 'actionSpace') for (const key of ['spaceId','nameKey','descriptionKey']) previewString(value[key], key)
  if (value.kind === 'resourceMovement') { previewLocation(value.from); previewLocation(value.to) }
  if (value.kind === 'text') previewString(value.text, 'Preview text')
  if (value.bonusVp !== undefined) finite(value.bonusVp, 'Preview bonus VP')
  if (value.cardUsed !== undefined) previewString(value.cardUsed, 'Preview returned card')
  if (value.sourceCards !== undefined) stringArray(value.sourceCards, 'Preview source cards')
  if (value.kind === 'futureOffers' || value.kind === 'futureSchedule') {
    if (!Array.isArray(value.entries)) throw new Error('Preview entries must be an array')
    for (const entry of value.entries) {
      assertRecord(entry, 'Preview entry')
      assertKeys(entry, value.kind === 'futureOffers' ? ['round','resources','resourcesPaid','actionNameKey'] : ['round','endRound','resources','actions','resourceCondition','roomType'], 'Preview entry')
      previewRound(entry.round); resourceMap(entry.resources)
      if (value.kind === 'futureOffers') {
        resourceMap(entry.resourcesPaid)
        if (entry.actionNameKey !== undefined) previewString(entry.actionNameKey, 'Preview action name')
      } else {
        if (entry.endRound !== undefined) { previewRound(entry.endRound); if (entry.endRound < entry.round) throw new Error('Preview round range must be ordered') }
        if (entry.roomType !== undefined && (typeof entry.roomType !== 'string' || !['wood','clay','stone'].includes(entry.roomType))) throw new Error('Invalid preview room type')
        if (entry.resourceCondition !== undefined) {
          assertRecord(entry.resourceCondition, 'Preview resource condition'); assertKeys(entry.resourceCondition, ['kind','resource','amount'], 'Preview resource condition')
          if (entry.resourceCondition.kind !== 'min-resource' || typeof entry.resourceCondition.resource !== 'string' || !resources.includes(entry.resourceCondition.resource)) throw new Error('Invalid preview resource condition')
          integer(entry.resourceCondition.amount, 'Preview resource minimum')
        }
        if (entry.actions !== undefined) {
          if (!Array.isArray(entry.actions)) throw new Error('Preview actions must be an array')
          for (const action of entry.actions) {
            assertRecord(action, 'Preview action'); assertKeys(action, ['kind','amount','resourcesPaid'], 'Preview action')
            if (typeof action.kind !== 'string' || !['field','stable','forest','moor'].includes(action.kind)) throw new Error('Invalid preview action kind')
            integer(action.amount, 'Preview action amount')
            if (action.resourcesPaid !== undefined) resourceMap(action.resourcesPaid)
          }
        }
      }
    }
  }
}
function descriptionPreview(value: unknown, depth = 0): void {
  if (depth > 24) throw new Error('Description preview exceeds the nesting limit')
  assertRecord(value, 'Description preview')
  if (value.kind === 'action') {
    assertKeys(value, ['kind','showLabel','labelKey','labelParams','effectPreview'], 'Description preview')
    previewString(value.labelKey, 'Description label key')
    if (value.showLabel !== undefined && typeof value.showLabel !== 'boolean') throw new Error('Description showLabel must be boolean')
    if (value.labelParams !== undefined) assertRecord(value.labelParams, 'Description label params')
    if (value.effectPreview !== undefined) effectPreview(value.effectPreview)
  } else if (value.kind === 'group') {
    assertKeys(value, ['kind','separator','parts'], 'Description preview'); previewString(value.separator, 'Description separator')
    if (!Array.isArray(value.parts)) throw new Error('Description parts must be an array')
    value.parts.forEach(part => descriptionPreview(part, depth + 1))
  } else throw new Error('Unsupported description preview kind')
}
function conditions(value: unknown): void {
  assertRecord(value, 'Payment conditions')
  assertKeys(value, ['minNumRooms', 'houseTypeWood', 'houseTypeClay', 'houseTypeStone'], 'Payment conditions')
  for (const [key, amount] of Object.entries(value)) finite(amount, `Condition ${key}`, true)
  if (value.minNumRooms !== undefined) integer(value.minNumRooms, 'Condition minNumRooms')
}
function bonus(value: unknown, cardId: string): void {
  assertRecord(value, 'Bonus')
  assertKeys(value, ['discount', 'choices', 'capDiscountAtCost', 'trackChoiceIndex', 'choiceAffectsState', 'optional', 'sources', 'conditions', 'minCost', 'maxCost'], 'Bonus')
  for (const key of ['discount', 'minCost', 'maxCost']) if (value[key] !== undefined) resourceMap(value[key])
  if (value.conditions !== undefined) conditions(value.conditions)
  for (const key of ['capDiscountAtCost', 'trackChoiceIndex', 'choiceAffectsState', 'optional']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`Bonus ${key} must be boolean`)
  if (value.sources !== undefined && (!Array.isArray(value.sources) || value.sources.some(source => source !== cardId))) throw new Error('Bonus sources must belong to this card')
  if (value.choices !== undefined) {
    if (!Array.isArray(value.choices)) throw new Error('Bonus choices must be an array')
    value.choices.forEach(choice => {
      assertRecord(choice, 'Bonus choice')
      if (choice.discount === undefined || choice.choices !== undefined) throw new Error('Bonus choice requires a discount')
      bonus(choice, cardId)
    })
  }
  validateBonus(value as Bonus)
}
function providers(value: unknown, cardId: string): void {
  if (!Array.isArray(value)) throw new Error('Payment providers must be an array')
  for (const provider of value) {
    assertRecord(provider, 'Payment provider')
    assertKeys(provider, ['key', 'sourceCard', 'available', 'covers', 'consume'], 'Payment provider')
    ownSource(provider.sourceCard, cardId); integer(provider.available, 'Provider availability')
    if (provider.available >= MAX_PAYMENT_PROVIDER_COMBINATIONS) throw new Error('Provider availability exceeds the 511-unit declaration limit')
    if (typeof provider.key !== 'string' || !isCardProvidedPaymentResourceKey(provider.key) || provider.key.split(':')[0] !== cardId || provider.sourceCard !== cardId) throw new Error('Provider resource key must be virtual and belong to this card')
    if (!Array.isArray(provider.covers)) throw new Error('Provider covers must be an array')
    for (const cover of provider.covers) {
      assertRecord(cover, 'Provider cover'); assertKeys(cover, ['resource', 'costAmount', 'paymentAmount'], 'Provider cover')
      if (typeof cover.resource !== 'string' || !resources.includes(cover.resource)) throw new Error('Invalid provider cover resource')
      integer(cover.costAmount, 'Covered amount'); integer(cover.paymentAmount, 'Provider amount')
      if (cover.costAmount === 0 || cover.paymentAmount === 0) throw new Error('Provider cover ratios must be positive integers')
    }
    assertRecord(provider.consume, 'Provider consumption')
    assertKeys(provider.consume, ['type', 'spaceId', 'resource'], 'Provider consumption')
    if (provider.consume.type !== 'actionSpace' || typeof provider.consume.spaceId !== 'string' || typeof provider.consume.resource !== 'string' || !resources.includes(provider.consume.resource)) throw new Error('Unsupported provider consumption')
    if (!provider.consume.spaceId.trim()) throw new Error('Provider action-space ID must be nonempty')
  }
  assertPaymentProviderEnumerationBudget(value as CardProvidedPaymentResourceProvider[])
}

function trade(value: unknown, cardId: string, usage: 'payment' | 'exchange' | 'exchange-declaration' = 'payment'): void {
  assertRecord(value, 'Trade')
  assertKeys(value, ['from', 'to', 'max', 'sourceId', ...(usage !== 'exchange-declaration' ? ['source'] : []), ...(usage === 'payment' ? ['scope', 'minCost', 'maxCost', 'groupId', 'groupMin', 'groupMax', 'replaceUpTo'] : ['fromFarmyard', 'triggers', 'blockedAnytimeInteractionKinds'])], 'Trade')
  resourceMap(value.from); resourceMap(value.to)
  if (!Object.values(value.from).some(amount => Number(amount) > 0) && value.max === undefined) throw new Error('An exchange without positive input requires a finite max')
  ownSource(value.sourceId, cardId)
  ownSource(value.source, cardId)
  if (value.max !== undefined) integer(value.max, 'Trade max')
  if (usage === 'payment') {
    if (value.scope !== undefined && value.scope !== 'unit' && value.scope !== 'action') throw new Error('Invalid payment trade scope')
    if (value.replaceUpTo !== undefined && typeof value.replaceUpTo !== 'boolean') throw new Error('Payment trade replaceUpTo must be boolean')
    if (value.groupId !== undefined && typeof value.groupId !== 'string') throw new Error('Payment trade groupId must be a string')
    for (const key of ['minCost', 'maxCost']) if (value[key] !== undefined) resourceMap(value[key])
    validateTradeModifier({...value, cardId} as TradeModifier)
  }
  if (value.fromFarmyard !== undefined && typeof value.fromFarmyard !== 'boolean') throw new Error('Exchange fromFarmyard must be boolean')
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
  if (value.nb !== undefined) integer(value.nb, 'Cost unit count')
  if (value.resourceReserve !== undefined) {
    assertRecord(value.resourceReserve, 'Resource reserve')
    assertKeys(value.resourceReserve, ['resources', 'minimum'], 'Resource reserve')
    stringArray(value.resourceReserve.resources, 'Reserve resources', resources)
    integer(value.resourceReserve.minimum, 'Reserve minimum')
  }
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
  if (meta.vp !== undefined) finite(meta.vp, 'Printed VP')
  for (const key of ['name', 'deck', 'category', 'artUrl', 'prerequisite', 'players']) if (meta[key] !== undefined && typeof meta[key] !== 'string') throw new Error(`Card ${key} must be a string`)
  for (const key of ['passing', 'implemented', 'isCookery', 'isBaking', 'isField', 'providesField', 'providesOccupation', 'extraVp', 'evenMoreSet']) if (meta[key] !== undefined && typeof meta[key] !== 'boolean') throw new Error(`Card ${key} must be boolean`)
  for (const key of ['number', 'maxRound']) if (meta[key] !== undefined) integer(meta[key], `Card ${key}`)
  const cardText = (text: Record<string, unknown>): void => {
    for (const key of ['desc', 'rules']) if (text[key] !== undefined && (!Array.isArray(text[key]) || text[key].some(line => typeof line !== 'string'))) throw new Error(`Card ${key} must be a string array`)
  }
  cardText(meta)
  for (const key of ['playerActionCardType', 'card_type']) if (meta[key] !== undefined && meta[key] !== 'minor' && meta[key] !== 'occupation') throw new Error(`Card ${key} must be minor or occupation`)
  if (meta.locales !== undefined) {
    assertRecord(meta.locales, 'Card locales')
    for (const locale of Object.values(meta.locales)) {
      assertRecord(locale, 'Card locale'); assertKeys(locale, ['name', 'desc', 'rules', 'prerequisite'], 'Card locale'); cardText(locale)
      for (const key of ['name', 'prerequisite']) if (locale[key] !== undefined && typeof locale[key] !== 'string') throw new Error(`Card locale ${key} must be a string`)
    }
  }
  if (meta.cost !== undefined) cost(meta.cost, cardId, true)
  if (meta.altCosts !== undefined) {
    if (!Array.isArray(meta.altCosts)) throw new Error('altCosts must be an array')
    meta.altCosts.forEach(item => resourceMap(item, true))
  }
  if (meta.returnCards !== undefined) stringArray(meta.returnCards, 'returnCards')
  for (const key of ['occupationPrerequisites', 'improvementPrerequisites']) if (meta[key] !== undefined) bounds(meta[key])
  if (meta.exchanges !== undefined) {
    if (!Array.isArray(meta.exchanges)) throw new Error('exchanges must be an array')
    meta.exchanges.forEach(item => trade(item, cardId, 'exchange-declaration'))
  }
  if (meta.modifiers !== undefined && !Array.isArray(meta.modifiers)) throw new Error('modifiers must be an array')
  for (const modifier of [...(Array.isArray(meta.modifiers) ? meta.modifiers : []), ...(meta.modifier !== undefined ? [meta.modifier] : [])]) {
    assertRecord(modifier, 'Cost modifier')
    assertKeys(modifier, ['type', 'cardId', 'appliesTo', 'from', 'to', 'max', 'scope', 'groupId', 'groupMin', 'groupMax', 'replaceUpTo', 'minCost', 'maxCost', 'conditions', 'discount', 'choices', 'capDiscountAtCost', 'trackChoiceIndex', 'choiceAffectsState', 'optional', 'resources'], 'Cost modifier')
    if (modifier.cardId !== cardId) throw new Error('Cost modifier cardId must be this card')
    if (modifier.conditions !== undefined) conditions(modifier.conditions)
    if (!['trade', 'bonus', 'remove-resource'].includes(String(modifier.type))) throw new Error('Unsupported cost modifier')
    if (!Array.isArray(modifier.appliesTo) || modifier.appliesTo.some(type => !(COST_MODIFIER_TYPES as readonly unknown[]).includes(type))) throw new Error('Unsupported modifier cost type')
    if (modifier.type === 'trade') {
      trade(Object.fromEntries(Object.entries(modifier).filter(([key]) => !['type', 'cardId', 'appliesTo', 'conditions'].includes(key))), cardId)
      if (modifier.scope !== undefined && modifier.scope !== 'unit' && modifier.scope !== 'action') throw new Error('Invalid trade modifier scope')
      if (modifier.groupId !== undefined && typeof modifier.groupId !== 'string') throw new Error('Trade modifier groupId must be a string')
      validateTradeModifier(modifier as TradeModifier)
    }
    if (modifier.type === 'bonus') bonus(Object.fromEntries(Object.entries(modifier).filter(([key]) => !['type', 'cardId', 'appliesTo'].includes(key))), cardId)
    if (modifier.type === 'remove-resource') {
      assertKeys(modifier, ['type', 'cardId', 'appliesTo', 'resources'], 'Remove-resource modifier')
      stringArray(modifier.resources, 'Removed cost resources', resources, true)
    }
  }

}

export function assertCustomActionData(actionId: string, params: Record<string, unknown>, context: Record<string, unknown>, cardId: string, state?: GameState, playerId?: string): void {
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
    assertCustomActionData(actionId, nestedParams, params.actionContext, cardId, state, playerId)
  }
  for (const exact of [context.exactCost, params.exactCost]) if (exact !== undefined) {
    assertRecord(exact, 'Exact cost')
    resourceMap(Object.fromEntries(Object.entries(exact).filter(([key]) => key !== 'max')), true)
    if (exact.max !== undefined) integer(exact.max, 'Exact cost maximum')
  }
  if (context.costOverride !== undefined) resourceMap(context.costOverride, false, false)
  if (actionId === 'pay') cost(params.cost ?? params, cardId)
  if (actionId === 'pay' && params.costType !== undefined && !(COST_MODIFIER_TYPES as readonly unknown[]).includes(params.costType)) throw new Error('Unsupported payment costType')
  if (actionId === 'pay' && params.reserveResources !== undefined) resourceMap(params.reserveResources)
  if (actionId === 'pay') for (const key of ['paymentChoice', 'optionPrefix']) if (params[key] !== undefined && typeof params[key] !== 'string') throw new Error(`${key} must be a string`)
  if (actionId === 'occupation' && params.allowedCards !== undefined) stringArray(params.allowedCards, 'Allowed occupation cards')
  if (actionId === 'push-to-card-stack' && (typeof params.item !== 'string' || !params.item)) throw new Error('Card stack item must be a nonempty string')
  if (actionId === 'improvement') {
    for (const types of [params.types, context.types]) if (types !== undefined) stringArray(types, 'Improvement types', ['major', 'minor'], true)
    if (params.allowedPurchases !== undefined) stringArray(params.allowedPurchases, 'Allowed purchases')
    if (context.minimumResourcesPaid !== undefined) resourceMap(context.minimumResourcesPaid, true)
  }
  if (actionId === 'stables' && context.max !== undefined) integer(context.max, 'Stable max')
  for (const key of ['skipRoomCheck', 'prefill']) if (context[key] !== undefined && typeof context[key] !== 'boolean') throw new Error(`${key} must be boolean`)
  if (actionId === 'breed' && context.animalTypes != null) {
    stringArray(context.animalTypes, 'Breed animals', state ? animalKeysForState(state) : ALL_ANIMAL_KEYS)
    if (new Set(context.animalTypes).size !== context.animalTypes.length) throw new Error('Breed animal types must be distinct')
  }
  if (['gain', 'store-on-card', 'take-from-card'].includes(actionId)) resourceMap(Object.fromEntries(Object.entries(params).filter(([key]) => resources.includes(key))))
  if (actionId === 'gain') {
    for (const key of ['recipientPlayerId', 'payerId']) if (params[key] !== undefined && (typeof params[key] !== 'string' || !state?.players?.some(player => player.id === params[key]))) throw new Error(`Gain ${key} must identify an existing player`)
    if (params.recipientMode !== undefined && params.recipientMode !== 'self' && params.recipientMode !== 'others') throw new Error('Gain recipientMode must be self or others')
  }
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
    if (request.entries === undefined) {
      integer(request.startRound, 'Future start round'); integer(request.count, 'Future count')
      if (request.startRound < 1 || request.startRound > 14) throw new Error('Future start round must be from 1 to 14')
      assertRecord(request.resources, 'Future resources')
    }
    const entries = Array.isArray(request.entries) ? request.entries : [request]
    for (const entry of entries) {
      assertRecord(entry, 'Future entry')
      if (request.entries !== undefined) assertKeys(entry, ['round', 'resources', 'roomType', 'actionContext'], 'Future entry')
      if (request.entries !== undefined && (!Number.isInteger(entry.round) || Number(entry.round) < 1 || Number(entry.round) > 14)) throw new Error('Future entry requires a round from 1 to 14')
      if (entry.resources !== undefined) {
        assertRecord(entry.resources, 'Future resources')
        assertKeys(entry.resources, [...resources, 'field', 'stable'], 'Future resources')
        Object.values(entry.resources).forEach(amount => integer(amount, 'Future amount'))
      }
      if (entry.roomType !== undefined && !['wood', 'clay', 'stone'].includes(String(entry.roomType))) throw new Error('Invalid future room type')
      if (entry.actionContext !== undefined || request.actionContext !== undefined) throw new Error('Future action-context overrides require a separate admitted settlement contract')
    }
    if (!state?.players?.some(player => player.id === request.playerId)) throw new Error('Future recipient must exist in the current game')
  }
  if (actionId === 'sow') {
    if (context.cropType !== undefined && !['grain', 'vegetable'].includes(String(context.cropType))) throw new Error('Workshop sow supports ordinary crops')
    if (params.crops !== undefined) {
      if (!Array.isArray(params.crops)) throw new Error('Workshop sow supports ordinary crop selections')
      for (const crop of params.crops) {
        assertRecord(crop, 'Sow crop'); assertKeys(crop, ['row', 'col', 'crop'], 'Sow crop')
        if (crop.crop !== 'grain' && crop.crop !== 'vegetable') throw new Error('Workshop sow supports ordinary crop selections')
      }
      farmPositions(params.crops.map(crop => ({row:crop.row,col:crop.col})), state, playerId)
    }
  }
  if (actionId === 'selection') {
    if (context.selectionKind !== undefined && context.selectionKind !== 'farm-position') throw new Error('Selection requires explicit farm-position candidates')
    const count = farmPositions(context.selectableTiles, state, playerId)
    const min = context.minSelections ?? 1, max = context.maxSelections ?? 1
    integer(min, 'Selection minimum'); integer(max, 'Selection maximum')
    if (min > max || min > count) throw new Error('Selection bounds must be ordered and achievable')
  }
  if (actionId === 'plow' && context.allowedTiles !== undefined) farmPositions(context.allowedTiles, state, playerId)
  if (actionId === 'sow') {
    for (const key of ['minSelections', 'maxSelections']) if (context[key] !== undefined) integer(context[key], key)
    if (context.minSelections !== undefined && context.maxSelections !== undefined && Number(context.minSelections) > Number(context.maxSelections)) throw new Error('Sow selection bounds must be ordered')
    if (context.excludedFields !== undefined) farmPositions(context.excludedFields, state, playerId)
  }
  if (actionId === 'emit-choice') {
    if (params.promptKey !== undefined && typeof params.promptKey !== 'string') throw new Error('Choice promptKey must be a string')
    if (params.promptParams !== undefined) assertRecord(params.promptParams, 'Choice promptParams')
    if (params.requiresExplicitChoice !== undefined && typeof params.requiresExplicitChoice !== 'boolean') throw new Error('Choice requiresExplicitChoice must be boolean')
    choiceOptions(params.options, cardId)
    if (params.multiSelect !== undefined) {
      assertRecord(params.multiSelect, 'Multi-select'); assertKeys(params.multiSelect, ['valuePrefix', 'minSelections', 'maxSelections'], 'Multi-select')
      if (typeof params.multiSelect.valuePrefix !== 'string' || !params.multiSelect.valuePrefix) throw new Error('Multi-select valuePrefix must be a nonempty string')
      integer(params.multiSelect.minSelections, 'Multi-select minSelections'); integer(params.multiSelect.maxSelections, 'Multi-select maxSelections')
      if (params.multiSelect.minSelections > params.multiSelect.maxSelections) throw new Error('Multi-select minSelections cannot exceed maxSelections')
      const values = (params.options as Array<{value: string; disabled?: boolean}>).filter(option => option.disabled !== true).map(option => option.value)
      if (values.some(value => !value || value.includes(','))) throw new Error('Multi-select values must be nonempty and contain no commas')
      if (params.multiSelect.minSelections > new Set(values).size) throw new Error('Multi-select minimum exceeds distinct available options')
    }
    if (!(params.options as Array<{disabled?: boolean}>).some(option => option.disabled !== true) && !(params.multiSelect && (params.multiSelect as {minSelections:number}).minSelections === 0)) throw new Error('Choice requires an enabled option or a valid empty multi-selection')
  }
  if (actionId === 'reorganize' && context.trigger !== undefined && context.trigger !== 'anytime') throw new Error('Custom reorganization cannot impersonate Harvest/round end')
  if (actionId === 'reap') {
    assertRecord(context.trigger, 'Reap trigger')
    assertKeys(context.trigger, ['phase', 'actionId', 'cardId'], 'Reap trigger')
    if (context.trigger.phase !== 'private-field-phase') throw new Error('Custom reap must use private-field-phase')
    ownSource(context.trigger.cardId, cardId)
  }
  if (actionId === 'exchange') {
    if (context.directTrade !== undefined) trade(context.directTrade, cardId, 'exchange')
    if (context.tradeIds !== undefined) stringArray(context.tradeIds, 'Exchange trade IDs', undefined, true)
    if (context.maxTradeTimesBySourceId !== undefined) {
      assertRecord(context.maxTradeTimesBySourceId, 'Exchange source caps')
      Object.values(context.maxTradeTimesBySourceId).forEach(value => integer(value, 'Exchange source cap'))
    }
  }
  if (actionId === 'fence' && context.fencePolicy !== undefined) {
    assertRecord(context.fencePolicy, 'Fence policy')
    assertKeys(context.fencePolicy, ['segmentBounds', 'newPastureBounds', 'cancelPolicy'], 'Ordinary fence policy')
    if (context.fencePolicy.segmentBounds !== undefined) {
      assertRecord(context.fencePolicy.segmentBounds, 'Fence segment bounds')
      assertKeys(context.fencePolicy.segmentBounds, ['fence', 'total'], 'Ordinary segment bounds')
      Object.values(context.fencePolicy.segmentBounds).forEach(value => bounds(value, 'Fence segment bounds'))
    }
    if (context.fencePolicy.newPastureBounds !== undefined) {
      assertRecord(context.fencePolicy.newPastureBounds, 'Pasture bounds'); assertKeys(context.fencePolicy.newPastureBounds, ['count', 'totalSize'], 'Pasture bounds')
      Object.values(context.fencePolicy.newPastureBounds).forEach(value => bounds(value, 'Pasture bounds'))
    }
    if (context.fencePolicy.cancelPolicy !== undefined && (typeof context.fencePolicy.cancelPolicy !== 'string' || !['allowCancel', 'forbidCancel'].includes(context.fencePolicy.cancelPolicy))) throw new Error('Unsupported fence cancel policy')
  }
}

export function validateCustomFlow(value: unknown, cardId: string, depth = 0, state?: GameState, playerId?: string): ActionFlow {
  if (depth > 24) throw new Error('Custom flow exceeds the nesting limit')
  assertRecord(value, 'ActionFlow')
  for (const key of ['promptKey', 'choiceLabelKey', 'optionId']) if (value[key] !== undefined && typeof value[key] !== 'string') throw new Error(`Flow ${key} must be a string`)
  if (value.choiceLabelParams !== undefined) assertRecord(value.choiceLabelParams, 'Flow choiceLabelParams')
  for (const key of ['optional', 'triggerSelectOnce']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`${key} must be boolean`)
  if (value.mode !== undefined && !['all', 'trigger-select'].includes(value.mode as string)) throw new Error('Unsupported composite mode')
  ownSource(value.sourceCard, cardId)
  if (value.targetPlayerId !== undefined && (typeof value.targetPlayerId !== 'string' || !(state?.players ?? []).some(player => player.id === value.targetPlayerId))) throw new Error('Target player must exist in the current game')
  const target = value.targetPlayerId as string | undefined ?? playerId
  if (value.anytimeWindow !== undefined) {
    assertRecord(value.anytimeWindow, 'Anytime window')
    assertKeys(value.anytimeWindow, ['allowed', 'blockedIds'], 'Anytime window')
    if (typeof value.anytimeWindow.allowed !== 'boolean' || value.anytimeWindow.blockedIds !== undefined && (!Array.isArray(value.anytimeWindow.blockedIds) || value.anytimeWindow.blockedIds.some(id => typeof id !== 'string'))) throw new Error('Invalid anytime window declaration')
  }
  const leaf = value.type === 'leaf'
  assertKeys(value, leaf ? sandboxFlowFields.leaf : sandboxFlowFields.composite, 'ActionFlow')
  if (leaf) {
    if (value.effectPreview !== undefined) effectPreview(value.effectPreview)
    if (typeof value.actionId !== 'string') throw new Error('ActionFlow requires an action ID')
    const params = value.params ?? {}; const context = value.actionContext ?? {}
    assertRecord(params, 'Flow params'); assertRecord(context, 'Flow actionContext')
    assertCustomActionData(value.actionId, params, context, cardId, state, target)
    value.sourceCard ??= cardId
  } else if (typeof value.type !== 'string' || !['seq', 'or', 'xor', 'parallel'].includes(value.type) || !Array.isArray(value.children)) throw new Error('Composite ActionFlow requires supported type and children')
  else {
    if (['xor', 'or'].includes(String(value.type)) && value.optional !== true && value.children.length === 0) throw new Error('Mandatory choice flow requires nonempty children')
    value.children.forEach(child => validateCustomFlow(child, cardId, depth + 1, state, target))
  }
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
  if ((metadata.table === 'effect' && hook !== 'onBeforePlayerTurn') || hook === 'resolveChoice') return validateCustomFlow(value, cardId, 0, args[0] as GameState, (args[1] as {id?: string})?.id)
  if (hook === 'onBeforePlayerTurn') { assertRecord(value, hook); assertKeys(value, ['skipTurn'], hook); if (value.skipTurn !== true && value.skipTurn !== false) throw new Error('skipTurn must be boolean'); return value }
  if (['computeBonusScore', 'computeExtraRoomCapacity', 'computeHarvestBreedOrderPriority', 'countExtraTurns', 'computeBreedThreshold', 'computeBreedableAnimalCount', 'computeAnimalScoreAdjustment'].includes(hook)) finite(value, hook, ['countExtraTurns', 'computeBreedThreshold', 'computeBreedableAnimalCount'].includes(hook))
  if (['countExtraTurns', 'computeExtraRoomCapacity', 'computeBreedThreshold', 'computeBreedableAnimalCount'].includes(hook)) integer(value, hook)
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
      if (!Number.isSafeInteger(position.row) || !Number.isSafeInteger(position.col)) throw new Error('Farm coordinates must be safe integers')
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
      Object.values(value.reservedSupply).forEach(amount => integer(amount, 'Reserved supply'))
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
    const state = args[hook === 'onComputeSharedAnimalZones' ? 3 : 2] as GameState
    for (const zone of value) {
      assertRecord(zone, 'Animal zone'); ownSource(zone.cardId, cardId)
      assertKeys(zone, ['id', 'zoneType', 'capacity', 'blocked', 'houseAnimalZone', 'animalType', 'animalCount', 'animalCounts', 'allowedAnimalType', 'allowedAnimalTypes', 'cardId', 'ownerPlayerId', 'animalOwnerPlayerId', 'breedingOwnerPlayerId', 'displayOwnerName', 'pastureIndex', 'farmPosition', 'countsFarmyardSpaceAsUnused', 'displaySource', 'exclusiveCardZoneLimit', 'capacityCounterKey', 'capacityLossOnPayment', 'requiredEmptyZoneGroupIds'], 'Animal zone')
      if (zone.zoneType !== 'card' || typeof zone.id !== 'string' || seen.has(zone.id)) throw new Error('Animal query must return distinct new card zones')
      seen.add(zone.id); integer(zone.capacity, 'Animal capacity')
      const owner = args[0] as { id: string }
      const animalOwner = (hook === 'onComputeSharedAnimalZones' ? args[1] : args[0]) as { id: string }
      if (zone.ownerPlayerId !== undefined && zone.ownerPlayerId !== owner?.id || zone.animalOwnerPlayerId !== undefined && zone.animalOwnerPlayerId !== animalOwner?.id) throw new Error('Animal-zone owners must match the query players')
      if (zone.breedingOwnerPlayerId !== undefined && !(state?.players ?? []).some(player => player.id === zone.breedingOwnerPlayerId)) throw new Error('Breeding owner player not found')
      for (const key of ['blocked', 'houseAnimalZone', 'countsFarmyardSpaceAsUnused', 'capacityLossOnPayment']) if (zone[key] !== undefined && typeof zone[key] !== 'boolean') throw new Error(`${key} must be boolean`)
      for (const key of ['animalType', 'allowedAnimalType']) if (zone[key] != null && !(ALL_ANIMAL_KEYS as readonly unknown[]).includes(zone[key])) throw new Error('Animal-zone type must be an animal')
      if (zone.allowedAnimalTypes !== undefined) stringArray(zone.allowedAnimalTypes, 'Allowed zone animals', ALL_ANIMAL_KEYS)
      for (const key of ['animalCount', 'pastureIndex', 'exclusiveCardZoneLimit']) if (zone[key] !== undefined) integer(zone[key], key)
      if (zone.animalCounts !== undefined) {
        assertRecord(zone.animalCounts, 'Zone animal counts'); assertKeys(zone.animalCounts, ALL_ANIMAL_KEYS, 'Zone animal counts')
        Object.values(zone.animalCounts).forEach(amount => integer(amount, 'Animal count'))
      }
      if (zone.requiredEmptyZoneGroupIds !== undefined) stringArray(zone.requiredEmptyZoneGroupIds, 'Empty zone groups')
      if (zone.displayOwnerName !== undefined && typeof zone.displayOwnerName !== 'string') throw new Error('Display owner name must be a string')
      if (zone.displaySource !== undefined && (typeof zone.displaySource !== 'string' || !['played-card', 'farm-position', 'borrowed-played-card'].includes(zone.displaySource))) throw new Error('Unsupported zone display source')
      if (zone.capacityCounterKey !== undefined && (typeof zone.capacityCounterKey !== 'string' || !zone.capacityCounterKey || ['__proto__', 'constructor', 'prototype'].includes(zone.capacityCounterKey))) throw new Error('Invalid zone capacity counter key')
      if (zone.farmPosition !== undefined) {
        assertRecord(zone.farmPosition, 'Zone farm position'); assertKeys(zone.farmPosition, ['row', 'col'], 'Zone farm position')
        finite(zone.farmPosition.row, 'Zone row'); finite(zone.farmPosition.col, 'Zone column')
        if (!Number.isSafeInteger(zone.farmPosition.row) || !Number.isSafeInteger(zone.farmPosition.col)) throw new Error('Zone coordinates must be safe integers')
      }
    }
  }
  return value
}

export function assertCustomListenerCapabilities(value: unknown, cardId: string, context?: CardListenerContext): void {
  if (value === null || value === undefined) return
  assertRecord(value, 'Listener result'); safeData(value); ownSource(value.sourceCard, cardId)
  assertKeys(value, ['doable', 'actionId', 'extraData', 'extraOptions', 'extraExchanges', 'followUpActions', 'flow', 'costs', 'costAttribution', 'reserveResources', 'trades', 'bonuses', 'paymentResourceProviders', 'sourceCard', 'countCardUse', 'labelKey', 'labelParams', 'decline', 'alternativeFlow'], 'Listener result')
  for (const key of ['doable', 'countCardUse', 'decline']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error(`Listener ${key} must be boolean`)
  if (value.labelKey !== undefined && typeof value.labelKey !== 'string') throw new Error('Listener labelKey must be a string')
  if (value.labelParams !== undefined) assertRecord(value.labelParams, 'Listener label params')
  if (value.costs !== undefined) {
    assertRecord(value.costs, 'Listener costs')
    resourceMap(Object.fromEntries(Object.entries(value.costs).filter(([,amount]) => amount !== undefined)), false, false)
  }
  if (value.flow !== undefined) validateCustomFlow(value.flow, cardId, 0, context?.state, context?.effectPlayer?.id ?? context?.player?.id)
  if (value.alternativeFlow !== undefined) validateCustomFlow(value.alternativeFlow, cardId, 0, context?.state, context?.player?.id)
  if (value.extraOptions !== undefined) choiceOptions(value.extraOptions, cardId)
  if (value.actionId !== undefined && !(SANDBOX_ALLOWED_ACTION_IDS as readonly unknown[]).includes(value.actionId)) throw new Error('Unsupported replacement action')
  if (value.actionId !== undefined) assertCustomActionData(String(value.actionId), {}, (value.extraData ?? {}) as Record<string, unknown>, cardId, context?.state, context?.player?.id)
  if (value.followUpActions !== undefined) {
    if (!Array.isArray(value.followUpActions)) throw new Error('followUpActions must be an array')
    for (const action of value.followUpActions) {
      const id = typeof action === 'string' ? action : action?.actionId
      if (!(SANDBOX_ALLOWED_ACTION_IDS as readonly unknown[]).includes(id)) throw new Error('Unsupported follow-up action')
      if (typeof action === 'object' && action) ownSource(action.sourceCard, cardId)
      assertCustomActionData(String(id), {}, {}, cardId, context?.state, context?.effectPlayer?.id ?? context?.player?.id)
      if (typeof action === 'object' && action) { assertRecord(action, 'Follow-up'); assertKeys(action, ['actionId', 'sourceCard'], 'Follow-up') }
    }
  }
  if (value.bonuses !== undefined) { if (!Array.isArray(value.bonuses)) throw new Error('Listener bonuses must be an array'); value.bonuses.forEach(item => bonus(item, cardId)) }
  if (value.paymentResourceProviders !== undefined) providers(value.paymentResourceProviders, cardId)
  if (value.reserveResources !== undefined) resourceMap(value.reserveResources)
  for (const key of ['extraExchanges', 'trades']) if (value[key] !== undefined) {
    if (!Array.isArray(value[key])) throw new Error(`${key} must be an array`)
    value[key].forEach(item => trade(item, cardId, key === 'extraExchanges' ? 'exchange-declaration' : 'payment'))
  }
  if (value.extraData !== undefined) {
    assertRecord(value.extraData, 'Listener extraData')
    if (Object.keys(value.extraData).length) assertCustomActionData(String(value.actionId ?? context?.actionId ?? ''), {}, value.extraData, cardId, context?.state, context?.player?.id)
  }
}
