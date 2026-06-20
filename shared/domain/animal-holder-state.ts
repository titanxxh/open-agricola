import type { AnimalKey } from '../contract/animals'
import type { PlayerState } from '../contract/types'

export const ANIMAL_KEYS = ['sheep', 'boar', 'cattle'] as const

export type AnimalCounts = Record<AnimalKey, number>

export const createAnimalCounts = (): AnimalCounts => ({ sheep: 0, boar: 0, cattle: 0 })

export const isAnimalKey = (value: unknown): value is AnimalKey =>
  value === 'sheep' || value === 'boar' || value === 'cattle'

const readPositiveInt = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0

export const sumAnimalCounts = (counts: Partial<Record<AnimalKey, number>>): number =>
  ANIMAL_KEYS.reduce((sum, key) => sum + Math.max(0, counts[key] ?? 0), 0)

export const readAnimalHolderCounts = (value: unknown): AnimalCounts => {
  const counts = createAnimalCounts()
  if (!value || typeof value !== 'object') return counts
  const data = value as {
    animalCounts?: unknown
    held?: unknown
    animalType?: unknown
  }
  if (data.animalCounts && typeof data.animalCounts === 'object') {
    const animalCounts = data.animalCounts as Record<string, unknown>
    for (const key of ANIMAL_KEYS) {
      counts[key] = readPositiveInt(animalCounts[key])
    }
    return counts
  }
  if (isAnimalKey(data.animalType)) {
    counts[data.animalType] = readPositiveInt(data.held)
  }
  return counts
}

export const writeAnimalHolderCounts = (
  extraData: Record<string, unknown>,
  counts: Partial<Record<AnimalKey, number>>,
): void => {
  const compact: Partial<Record<AnimalKey, number>> = {}
  for (const key of ANIMAL_KEYS) {
    const amount = Math.max(0, Math.floor(counts[key] ?? 0))
    if (amount > 0) compact[key] = amount
  }
  if (Object.keys(compact).length === 0) {
    delete extraData.animalCounts
    delete extraData.held
    delete extraData.animalType
    return
  }
  extraData.animalCounts = compact
  const occupiedTypes = ANIMAL_KEYS.filter((key) => (compact[key] ?? 0) > 0)
  if (occupiedTypes.length === 1) {
    const animalType = occupiedTypes[0]!
    extraData.animalType = animalType
    extraData.held = compact[animalType]
  } else {
    delete extraData.animalType
    delete extraData.held
  }
}

export const clampAnimalCountsToCapacity = (
  counts: AnimalCounts,
  capacity: number,
): { counts: AnimalCounts; discarded: AnimalCounts } => {
  const clamped = createAnimalCounts()
  const discarded = createAnimalCounts()
  let remaining = Math.max(0, Math.floor(capacity))
  for (const key of ANIMAL_KEYS) {
    const amount = Math.max(0, counts[key] ?? 0)
    const kept = Math.min(amount, remaining)
    clamped[key] = kept
    discarded[key] = amount - kept
    remaining -= kept
  }
  return { counts: clamped, discarded }
}

export const subtractAnimalCountsFromResources = (
  player: PlayerState,
  counts: Partial<Record<AnimalKey, number>>,
): void => {
  for (const key of ANIMAL_KEYS) {
    const amount = Math.max(0, counts[key] ?? 0)
    if (amount <= 0) continue
    player.resources[key] = Math.max(0, (player.resources[key] ?? 0) - amount)
  }
}
