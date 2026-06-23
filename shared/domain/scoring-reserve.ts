import type { PlayerState, Resource } from '../contract/types'
import { REAL_RESOURCE_KEYS } from '../contract/resource-keys'

export const SCORING_RESERVE_BONUS_KEY = 'scoringReserveBonus'

export type ScoringReserveBonus = {
  reserved: Partial<Resource>
  score: number
  cardType?: 'major' | 'minor' | 'occupation'
}

export type SelectedScoringReserveBonus = {
  cardId: string
  bonus: ScoringReserveBonus
}

const REAL_RESOURCE_KEY_SET: ReadonlySet<string> = new Set(REAL_RESOURCE_KEYS)

export const normalizeScoringReserveResources = (
  value: unknown,
): Partial<Resource> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Partial<Resource> = {}
  for (const [key, rawAmount] of Object.entries(value)) {
    if (!REAL_RESOURCE_KEY_SET.has(key)) return undefined
    if (
      typeof rawAmount !== 'number' ||
      !Number.isInteger(rawAmount) ||
      rawAmount < 0
    ) {
      return undefined
    }
    if (rawAmount > 0) {
      ;(out as Record<string, number>)[key] = rawAmount
    }
  }
  return out
}

export const readScoringReserveBonus = (
  value: unknown,
): ScoringReserveBonus | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as {
    reserved?: unknown
    score?: unknown
    cardType?: unknown
  }
  if (typeof record.score !== 'number' || !Number.isFinite(record.score)) {
    return undefined
  }
  const reserved = normalizeScoringReserveResources(record.reserved)
  if (!reserved) return undefined
  const cardType = record.cardType
  if (
    cardType !== undefined &&
    cardType !== 'major' &&
    cardType !== 'minor' &&
    cardType !== 'occupation'
  ) {
    return undefined
  }
  return {
    reserved,
    score: record.score,
    ...(cardType ? { cardType } : {}),
  }
}

export const getSelectedScoringReserveBonuses = (
  player: PlayerState,
): SelectedScoringReserveBonus[] => {
  const cardStates = player.cardStates ?? {}
  const entries: SelectedScoringReserveBonus[] = []
  for (const [cardId, cardState] of Object.entries(cardStates)) {
    const bonus = readScoringReserveBonus(
      cardState.extraData?.[SCORING_RESERVE_BONUS_KEY],
    )
    if (bonus) entries.push({ cardId, bonus })
  }
  return entries
}

export const sumSelectedScoringReserve = (
  player: PlayerState,
  options: { excludeCardId?: string } = {},
): Partial<Resource> => {
  const out: Partial<Resource> = {}
  for (const { cardId, bonus } of getSelectedScoringReserveBonuses(player)) {
    if (cardId === options.excludeCardId) continue
    for (const key of REAL_RESOURCE_KEYS) {
      const amount = bonus.reserved[key] ?? 0
      if (amount > 0) out[key] = (out[key] ?? 0) + amount
    }
  }
  return out
}

export const canAddScoringReserve = (
  player: PlayerState,
  reserved: Partial<Resource>,
  options: { excludeCardId?: string } = {},
): boolean => {
  const existing = sumSelectedScoringReserve(player, options)
  for (const key of REAL_RESOURCE_KEYS) {
    const requested = reserved[key] ?? 0
    const remaining = (player.resources[key] ?? 0) - (existing[key] ?? 0)
    if (requested > remaining) return false
  }
  return true
}

export const subtractScoringReserve = (
  resources: Resource,
  reserved: Partial<Resource>,
): Resource => {
  const out: Resource = { ...resources }
  for (const key of REAL_RESOURCE_KEYS) {
    const amount = reserved[key] ?? 0
    if (amount > 0) out[key] = Math.max(0, (out[key] ?? 0) - amount)
  }
  return out
}
