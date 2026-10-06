import type { CardStatePresentation, PublicCardMarker } from '../contract/card-state'
import type { CardResourceStats, CropStack, Resource } from '../contract/types'
import { ALL_ANIMAL_KEYS } from '../contract/animals'
import { PSEUDO_RESOURCE_KEYS, REAL_RESOURCE_KEYS } from '../contract/resource-keys'

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const integer = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
const resources = (value: unknown, keys: readonly string[] = REAL_RESOURCE_KEYS): Partial<Resource> => {
  const input = record(value)
  return Object.fromEntries(keys.flatMap((key) => integer(input?.[key]) > 0 ? [[key, integer(input?.[key])]] : []))
}
const crop = (value: unknown): CropStack | undefined => {
  const input = record(value)
  const kind = input?.kind
  const remaining = integer(input?.remaining)
  return (kind === 'grain' || kind === 'vegetable' || kind === 'wood' || kind === 'stone') && remaining > 0
    ? { kind, remaining } : undefined
}

/** A closed wire contract, shared by recorded native and sandbox display queries. */
export const normalizeCardStatePresentation = (value: unknown): CardStatePresentation => {
  const input = record(value)
  if (!input) return {}
  const out: CardStatePresentation = {}
  if (typeof input.infobox === 'string') out.infobox = input.infobox
  const counters = record(input.counters)
  if (counters) out.counters = Object.fromEntries(Object.entries(counters).flatMap(([key, count]) =>
    integer(count) > 0 ? [[key, integer(count)]] : [],
  ))
  if (Array.isArray(input.stack)) out.stack = input.stack.filter((item): item is string => typeof item === 'string')
  const stats = record(input.resourceStats)
  if (stats) out.resourceStats = {
    used: integer(stats.used), gained: resources(stats.gained, [...REAL_RESOURCE_KEYS, ...PSEUDO_RESOURCE_KEYS]),
    paid: resources(stats.paid), saved: resources(stats.saved), receivedPayment: resources(stats.receivedPayment),
    paidToOthers: resources(stats.paidToOthers),
  } as CardResourceStats
  if (Array.isArray(input.resourceGroups)) out.resourceGroups = input.resourceGroups.map((group) => resources(group)).filter((group) => Object.keys(group).length > 0)
  if (Array.isArray(input.cropLayers)) out.cropLayers = input.cropLayers.flatMap((layer) => {
    const data = record(layer)
    const stack = crop(data?.stack)
    if (!stack) return []
    return [{ stack, ...(Number.isInteger(data?.slotIndex) && Number(data?.slotIndex) >= 0 ? { slotIndex: Number(data?.slotIndex) } : {}),
      ...(typeof data?.top === 'boolean' ? { top: data.top } : {}) }]
  })
  if (Array.isArray(input.animalMarkers)) out.animalMarkers = input.animalMarkers.flatMap((marker) => {
    const data = record(marker)
    const animal = ALL_ANIMAL_KEYS.find((key) => key === data?.animal)
    const count = integer(data?.count)
    return animal && count > 0 ? [{ animal, count, ...(data?.pose === 'lying' ? { pose: 'lying' as const } : {}) }] : []
  })
  if (typeof input.heldWorkerId === 'string') out.heldWorkerId = input.heldWorkerId
  if (Array.isArray(input.reservedActionSpaces)) out.reservedActionSpaces = input.reservedActionSpaces.filter((id): id is string => typeof id === 'string')
  if (Array.isArray(input.actionSpaceAttachments)) out.actionSpaceAttachments = input.actionSpaceAttachments.flatMap((attachment) => {
    const data = record(attachment)
    return typeof data?.spaceId === 'string' ? [{ spaceId: data.spaceId, resources: resources(data.resources) }] : []
  })
  if (Array.isArray(input.farmTerrainMarkers)) out.farmTerrainMarkers = input.farmTerrainMarkers.flatMap((marker) => {
    const data = record(marker)
    return Number.isInteger(data?.row) && Number.isInteger(data?.col) && typeof data?.kind === 'string'
      ? [{ row: Number(data?.row), col: Number(data?.col), kind: data.kind,
        ...(typeof data.workerId === 'string' ? { workerId: data.workerId } : {}) }] : []
  })
  if (Array.isArray(input.publicCardMarkers)) out.publicCardMarkers = input.publicCardMarkers.flatMap((marker) => {
    const data = record(marker)
    if (typeof data?.id !== 'string' || typeof data?.label !== 'string' || typeof data?.sourceCardId !== 'string') return []
    const result: PublicCardMarker = { id: data.id, label: data.label, sourceCardId: data.sourceCardId }
    if (typeof data.score === 'number' && Number.isFinite(data.score)) result.score = data.score
    if (typeof data.sourcePlayerId === 'string') result.sourcePlayerId = data.sourcePlayerId
    return [result]
  })
  if (input.completedTier === 1 || input.completedTier === 2 || input.completedTier === 3) out.completedTier = input.completedTier
  return out
}
