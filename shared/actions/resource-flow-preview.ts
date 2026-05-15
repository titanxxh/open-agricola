import type { ActionFlow, Resource } from '../contract/types'

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
  'begging',
]

export const cloneResources = (resources: Resource): Resource => ({ ...resources })

const flatResourceFromParams = (params: Record<string, unknown> | undefined): Partial<Resource> | null => {
  if (!params) return null
  if ('cost' in params) {
    const cost = params.cost
    if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return null
    return cost as Partial<Resource>
  }
  const keys = Object.keys(params)
  if (keys.length === 0) return null
  if (!keys.every((key) => RESOURCE_KEYS.includes(key as keyof Resource))) return null
  return params as Partial<Resource>
}

const applyGainPreview = (resources: Resource, params: Record<string, unknown> | undefined): boolean => {
  const gain = flatResourceFromParams(params)
  if (!gain) return true
  for (const key of RESOURCE_KEYS) {
    const amount = gain[key] ?? 0
    if (amount > 0) resources[key] += amount
  }
  return true
}

const applyPayPreview = (resources: Resource, params: Record<string, unknown> | undefined): boolean => {
  const cost = flatResourceFromParams(params)
  if (!cost) return false
  for (const key of RESOURCE_KEYS) {
    const amount = cost[key] ?? 0
    if (amount > 0 && resources[key] < amount) return false
  }
  for (const key of RESOURCE_KEYS) {
    const amount = cost[key] ?? 0
    if (amount > 0) resources[key] -= amount
  }
  return true
}

const previewFlow = (flow: ActionFlow, resources: Resource): boolean => {
  if (flow.optional) {
    void resources
    return true
  }

  if (flow.type === 'leaf') {
    if (flow.actionId === 'gain') return applyGainPreview(resources, flow.params)
    if (flow.actionId === 'pay') return applyPayPreview(resources, flow.params)
    return false
  }

  if (flow.type === 'or' || flow.type === 'xor') return false

  for (const child of flow.children) {
    if (!previewFlow(child, resources)) return false
  }
  return true
}

export const applyPureResourceFlowPreview = (
  flow: ActionFlow,
  resources: Resource,
): Resource | null => {
  const next = cloneResources(resources)
  if (!previewFlow(flow, next)) return null
  return next
}

export const isPureResourceFlowCurrentlyPayable = (
  flow: ActionFlow,
  resources: Resource,
): boolean => applyPureResourceFlowPreview(flow, resources) !== null
