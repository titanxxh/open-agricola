import type { ActionFlow, PaymentResourceKey, PaymentResourceMap, Resource, SupplyTokenCounts } from '../contract/types'

export const RESOURCE_KEYS: Array<keyof Resource> = [
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'horse',
  'fuel',
  'begging',
]

const SUPPLY_TOKEN_KEYS = ['fence', 'stable'] satisfies PaymentResourceKey[]
const PAYMENT_RESOURCE_KEYS: PaymentResourceKey[] = [...RESOURCE_KEYS, ...SUPPLY_TOKEN_KEYS]

type PreviewPool = {
  resources: Resource
  supplyTokens: SupplyTokenCounts
}

export type ResourceFlowPreviewAvailability = {
  supplyTokens?: SupplyTokenCounts
}

export const cloneResources = (resources: Resource): Resource => ({ ...resources })

const flatResourceFromParams = (params: Record<string, unknown> | undefined): PaymentResourceMap | null => {
  if (!params) return null
  if ('cost' in params) {
    const cost = params.cost
    if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return null
    return cost as PaymentResourceMap
  }
  const keys = Object.keys(params)
  if (keys.length === 0) return null
  if (!keys.every((key) => PAYMENT_RESOURCE_KEYS.includes(key as PaymentResourceKey))) return null
  return params as PaymentResourceMap
}

const applyGainPreview = (pool: PreviewPool, params: Record<string, unknown> | undefined): boolean => {
  const gain = flatResourceFromParams(params)
  if (!gain) return true
  for (const key of RESOURCE_KEYS) {
    const amount = gain[key] ?? 0
    if (amount > 0) pool.resources[key] = (pool.resources[key] ?? 0) + amount
  }
  return true
}

const applyPayPreview = (pool: PreviewPool, params: Record<string, unknown> | undefined): boolean => {
  const cost = flatResourceFromParams(params)
  if (!cost) return false
  for (const key of RESOURCE_KEYS) {
    const amount = cost[key] ?? 0
    if (amount > 0 && (pool.resources[key] ?? 0) < amount) return false
  }
  for (const key of SUPPLY_TOKEN_KEYS) {
    const amount = cost[key] ?? 0
    if (amount > 0 && (pool.supplyTokens[key] ?? 0) < amount) return false
  }
  for (const key of RESOURCE_KEYS) {
    const amount = cost[key] ?? 0
    if (amount > 0) pool.resources[key] = (pool.resources[key] ?? 0) - amount
  }
  for (const key of SUPPLY_TOKEN_KEYS) {
    const amount = cost[key] ?? 0
    if (amount > 0) pool.supplyTokens[key] = (pool.supplyTokens[key] ?? 0) - amount
  }
  return true
}

const previewFlow = (flow: ActionFlow, pool: PreviewPool, isRoot = true): boolean => {
  if (!isRoot && flow.optional) return true

  if (flow.type === 'leaf') {
    if (flow.actionId === 'gain') return applyGainPreview(pool, flow.params)
    if (flow.actionId === 'pay') return applyPayPreview(pool, flow.params)
    return false
  }

  if (flow.type === 'or' || flow.type === 'xor') return false

  for (const child of flow.children) {
    if (!previewFlow(child, pool, false)) return false
  }
  return true
}

const isPreviewableResourceFlow = (flow: ActionFlow, isRoot = true): boolean => {
  if (!isRoot && flow.optional) return true
  if (flow.type === 'leaf') {
    if (flow.actionId === 'gain') return true
    if (flow.actionId === 'pay') return flatResourceFromParams(flow.params) !== null
    return false
  }
  if (flow.type === 'or' || flow.type === 'xor') return false
  return flow.children.every((child) => isPreviewableResourceFlow(child, false))
}

export const applyPureResourceFlowPreview = (
  flow: ActionFlow,
  resources: Resource,
  availability: ResourceFlowPreviewAvailability = {},
): Resource | null => {
  const pool = {
    resources: cloneResources(resources),
    supplyTokens: { ...(availability.supplyTokens ?? {}) },
  }
  if (!previewFlow(flow, pool)) return null
  return pool.resources
}

export const canPreviewPureResourceFlow = isPreviewableResourceFlow

export const isPureResourceFlowCurrentlyPayable = (
  flow: ActionFlow,
  resources: Resource,
  availability: ResourceFlowPreviewAvailability = {},
): boolean => applyPureResourceFlowPreview(flow, resources, availability) !== null
