import type { Pasture, PlayerState } from '../../../shared/contract/types'
import type { ActionChoiceOption } from '../../../shared/contract/types'
import type { GameState } from '../../../shared/contract/types'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../../../shared/contract/animals'
import { parsePositionKey, positionKey } from '../../../shared/domain/farm'
import {
  compactAnimalCounts,
  readAnimalHolderCounts,
  sumAnimalCounts,
} from '../../../shared/domain/animal-holder-state'
import type { AnimalReorgState, PendingAnimalReorg, PendingChoice } from '../../types/ui'
import type { EngineProgress } from './use-engine-flow'

export type AnimalTotals = Record<AnimalKey, number>

type AnimalType = AnimalKey

type AnimalDisplay = {
  animalType: AnimalType | null
  animalCount: number
  animalCounts?: Partial<Record<AnimalType, number>>
  allowedAnimalType?: AnimalType | null
  allowedAnimalTypes?: AnimalType[]
}

export type CardAnimalDisplay = AnimalDisplay & {
  capacity: number
  zoneId: string
  isReorgDraft: boolean
}

export type BorrowedPlayedCardDisplay = CardAnimalDisplay & {
  cardId: string
  cardType: 'minor' | 'occupation' | 'major'
  ownerPlayerId?: string
  animalOwnerPlayerId?: string
  displayOwnerName?: string
  displaySource: 'borrowed-played-card'
}

type PlayerWithCardAnimalZones = PlayerState & {
  playedCardAnimalZones?: AnimalReorgState['zones']
  farmCardAnimalZones?: AnimalReorgState['zones']
  borrowedPlayedCardAnimalZones?: AnimalReorgState['zones']
}

const interactionZoneAnimalTotal = (zone: AnimalReorgState['zones'][number]) => {
  const animalCounts = zone.animalCounts
  if (animalCounts) {
    return ALL_ANIMAL_KEYS.reduce((sum, animal) => sum + Math.max(0, animalCounts[animal] ?? 0), 0)
  }
  return Math.max(0, zone.animalCount ?? 0)
}

export const wouldExceedExclusiveCardZoneLimit = (
  zones: AnimalReorgState['zones'],
  zoneId: string,
) => {
  const target = zones.find((zone) => zone.id === zoneId)
  if (!target || target.zoneType !== 'card' || !target.cardId) return false
  if (target.exclusiveCardZoneLimit === undefined) return false
  if (interactionZoneAnimalTotal(target) > 0) return false
  const limit = Math.max(0, Math.floor(target.exclusiveCardZoneLimit))
  const occupied = zones.filter((zone) =>
    zone.id !== target.id &&
    zone.zoneType === 'card' &&
    zone.cardId === target.cardId &&
    zone.ownerPlayerId === target.ownerPlayerId &&
    interactionZoneAnimalTotal(zone) > 0
  ).length
  return occupied >= limit
}

export const hasUnassignedAnimals = (remaining: AnimalTotals | null | undefined) =>
  Boolean(remaining && ALL_ANIMAL_KEYS.some((animal) => remaining[animal] > 0))

export const computeReorgAvailableAnimals = (player: PlayerState): AnimalTotals => {
  const totals = {} as AnimalTotals
  for (const animal of ALL_ANIMAL_KEYS) {
    totals[animal] = Math.max(0, Math.floor(player.resources[animal] ?? 0))
  }
  return totals
}

export const shouldShowAnimalDiscardPrompt = (
  animalReorg: AnimalReorgState | null,
  remaining: AnimalTotals | null | undefined,
) => Boolean(animalReorg && !animalReorg.confirmDiscard && hasUnassignedAnimals(remaining))

export const applyAnimalReorgToPlayer = (params: {
  player: PlayerState
  animalReorg: AnimalReorgState
  totals: AnimalTotals
  getPastureCapacity: (pasture: Pasture) => number
}) => {
  const { player, animalReorg, totals, getPastureCapacity } = params
  const pastureZones = animalReorg.zones.filter((zone) => zone.zoneType === 'pasture')
  player.pastures = player.pastures.map((pasture) => {
    const assigned = pastureZones.find((zone) => zone.id === pasture.id)
    if (!assigned || !assigned.animalType) {
      return { ...pasture, animalType: null, animalCount: 0 }
    }
    const capacity = getPastureCapacity(pasture)
    const count = Math.max(0, Math.min(capacity, assigned.animalCount))
    return {
      ...pasture,
      animalType: count > 0 ? assigned.animalType : null,
      animalCount: count,
    }
  })
  const houseZone = animalReorg.zones.find((zone) => zone.zoneType === 'house')
  player.houseAnimalType = houseZone?.animalType ?? null
  player.houseAnimalCount = houseZone?.animalType && houseZone.animalCount > 0 ? 1 : 0
  const stableZones = animalReorg.zones.filter((zone) => zone.zoneType === 'stable')
  const stableAnimals: Record<string, AnimalType | null> = {}
  stableZones.forEach((zone) => {
    const key = zone.id.replace('stable:', '')
    stableAnimals[key] = zone.animalType ?? null
  })
  player.stableAnimals = stableAnimals
  for (const animal of ALL_ANIMAL_KEYS) {
    player.resources[animal] = totals[animal]
  }
}

export const buildPastureDisplayMap = (
  player: PlayerState | null | undefined,
  animalReorg: AnimalReorgState | null | undefined,
) => {
  const map = new Map<string, AnimalDisplay>()
  ;(player?.pastures ?? []).forEach((pasture) => {
    map.set(pasture.id, {
      animalType: pasture.animalType,
      animalCount: pasture.animalCount,
    })
  })
  animalReorg?.zones
    .filter((zone) => zone.zoneType === 'pasture')
    .forEach((zone) => {
      map.set(zone.id, {
        animalType: zone.animalType,
        animalCount: zone.animalCount,
      })
    })
  return map
}

export const buildStableDisplayMap = (
  player: PlayerState | null | undefined,
  animalReorg: AnimalReorgState | null | undefined,
) => {
  const map = new Map<string, AnimalDisplay>()
  ;(player?.stableTiles ?? []).forEach((tile) => {
    const key = positionKey(tile)
    const type = player?.stableAnimals?.[key] ?? null
    map.set(key, {
      animalType: type as AnimalType | null,
      animalCount: type ? 1 : 0,
    })
  })
  Object.entries(player?.stableAnimals ?? {}).forEach(([key, type]) => {
    map.set(key, {
      animalType: type as AnimalType | null,
      animalCount: type ? 1 : 0,
    })
  })
  animalReorg?.zones
    .filter((zone) => zone.zoneType === 'stable')
    .forEach((zone) => {
      map.set(zone.id.replace('stable:', ''), {
        animalType: zone.animalType,
        animalCount: zone.animalCount,
      })
    })
  return map
}

export const buildCardDisplayMap = (
  displayPlayer: PlayerState | null | undefined,
  animalReorg: AnimalReorgState | null | undefined,
) => {
  const map = new Map<string, CardAnimalDisplay>()
  const putZone = (zone: AnimalReorgState['zones'][number], isReorgDraft: boolean) => {
    if (zone.zoneType !== 'card') return
    if (zone.farmPosition) return
    if (zone.displaySource === 'borrowed-played-card') return
    if (displayPlayer?.id && zone.animalOwnerPlayerId && zone.animalOwnerPlayerId !== displayPlayer.id) return
    const cardId = zone.cardId ?? zone.id.replace(/^card:/, '')
    const display: CardAnimalDisplay = {
      animalType: zone.animalType ?? null,
      animalCount: Math.max(0, zone.animalCount ?? 0),
      capacity: zone.capacity,
      zoneId: zone.id,
      isReorgDraft,
    }
    if (zone.animalCounts) display.animalCounts = zone.animalCounts
    if (zone.allowedAnimalType !== undefined) display.allowedAnimalType = zone.allowedAnimalType
    if (zone.allowedAnimalTypes) display.allowedAnimalTypes = zone.allowedAnimalTypes
    map.set(cardId, display)
  }
  ;((displayPlayer as PlayerWithCardAnimalZones | null | undefined)?.playedCardAnimalZones ?? [])
    .forEach((zone) => putZone(zone, false))
  animalReorg?.zones
    .forEach((zone) => putZone(zone, true))
  return map
}

const playedCardType = (
  state: GameState,
  ownerPlayerId: string | undefined,
  cardId: string,
): BorrowedPlayedCardDisplay['cardType'] => {
  const owner = state.players.find((candidate) => candidate.id === ownerPlayerId)
  if (owner?.occupationPlayed.includes(cardId)) return 'occupation'
  if (owner?.improvements.includes(cardId)) return 'major'
  return 'minor'
}

const borrowedPlayedCardDisplayFromZone = (
  state: GameState,
  zone: AnimalReorgState['zones'][number],
  isReorgDraft: boolean,
): BorrowedPlayedCardDisplay | null => {
  if (zone.zoneType !== 'card') return null
  if (zone.farmPosition) return null
  if (zone.displaySource !== 'borrowed-played-card') return null
  const cardId = zone.cardId ?? zone.id.replace(/^card:/, '')
  return {
    animalType: zone.animalType ?? null,
    animalCount: Math.max(0, zone.animalCount ?? 0),
    animalCounts: zone.animalCounts,
    allowedAnimalType: zone.allowedAnimalType,
    allowedAnimalTypes: zone.allowedAnimalTypes,
    capacity: zone.capacity,
    zoneId: zone.id,
    cardId,
    cardType: playedCardType(state, zone.ownerPlayerId, cardId),
    ownerPlayerId: zone.ownerPlayerId,
    animalOwnerPlayerId: zone.animalOwnerPlayerId,
    displayOwnerName: zone.displayOwnerName,
    displaySource: 'borrowed-played-card',
    isReorgDraft,
  }
}

const hostedZoneIdsFromZoneId = (zoneId: string): {
  ownerPlayerId?: string
  animalOwnerPlayerId?: string
} => {
  const match = zoneId.match(/^card:[^:]+:owner:([^:]+):animalOwner:([^:]+)$/)
  if (!match) return {}
  return { ownerPlayerId: match[1], animalOwnerPlayerId: match[2] }
}

const normalizeBorrowedDraftZone = (
  zone: AnimalReorgState['zones'][number],
): AnimalReorgState['zones'][number] => {
  if (zone.ownerPlayerId && zone.animalOwnerPlayerId) return zone
  const parsed = hostedZoneIdsFromZoneId(zone.id)
  if (!parsed.ownerPlayerId && !parsed.animalOwnerPlayerId) return zone
  const normalized = { ...zone }
  if (!normalized.ownerPlayerId && parsed.ownerPlayerId) normalized.ownerPlayerId = parsed.ownerPlayerId
  if (!normalized.animalOwnerPlayerId && parsed.animalOwnerPlayerId) {
    normalized.animalOwnerPlayerId = parsed.animalOwnerPlayerId
  }
  return normalized
}

export const buildBorrowedPlayedCardDisplays = (
  state: GameState | null | undefined,
  displayPlayer: PlayerState | null | undefined,
  animalReorg: AnimalReorgState | null | undefined,
) => {
  const map = new Map<string, BorrowedPlayedCardDisplay>()
  if (!state || !displayPlayer) return []
  ;((displayPlayer as PlayerWithCardAnimalZones).borrowedPlayedCardAnimalZones ?? []).forEach((zone) => {
    const display = borrowedPlayedCardDisplayFromZone(state, zone, false)
    if (display) map.set(display.zoneId, display)
  })
  animalReorg?.zones.forEach((zone) => {
    const normalizedZone = normalizeBorrowedDraftZone(zone)
    if (normalizedZone.animalOwnerPlayerId && normalizedZone.animalOwnerPlayerId !== displayPlayer.id) return
    const display = borrowedPlayedCardDisplayFromZone(state, normalizedZone, true)
    if (display) map.set(display.zoneId, display)
  })
  return [...map.values()].sort((a, b) =>
    (a.displayOwnerName ?? '').localeCompare(b.displayOwnerName ?? '') ||
    a.cardId.localeCompare(b.cardId)
  )
}

const animalTypeFromCounts = (counts: Partial<Record<AnimalType, number>>): AnimalType | null => {
  const used = ALL_ANIMAL_KEYS.filter((animal) => (counts[animal] ?? 0) > 0)
  return used.length === 1 ? used[0]! : null
}

const readAllowedAnimalType = (value: unknown): AnimalType | null | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const type = (value as { allowedAnimalType?: unknown }).allowedAnimalType
  if (type === null) return null
  return ALL_ANIMAL_KEYS.includes(type as AnimalType) ? type as AnimalType : undefined
}

const readAllowedAnimalTypes = (value: unknown): AnimalType[] | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const types = (value as { allowedAnimalTypes?: unknown }).allowedAnimalTypes
  if (!Array.isArray(types)) return undefined
  return types.filter((type): type is AnimalType => ALL_ANIMAL_KEYS.includes(type as AnimalType))
}

const readCapacity = (value: unknown, fallback: number) => {
  if (!value || typeof value !== 'object') return fallback
  const capacity = (value as { capacity?: unknown }).capacity
  return typeof capacity === 'number' && Number.isFinite(capacity)
    ? Math.max(0, Math.floor(capacity))
    : fallback
}

export const buildFarmCardDisplayMap = (
  player: PlayerState | null | undefined,
  animalReorg: AnimalReorgState | null | undefined,
) => {
  const map = new Map<string, CardAnimalDisplay>()
  Object.values(player?.cardStates ?? {}).forEach((state) => {
    const countsByZone = state?.extraData?.animalCountsByZone
    if (!countsByZone || typeof countsByZone !== 'object') return
    Object.entries(countsByZone as Record<string, unknown>).forEach(([zoneId, stored]) => {
      const position = parsePositionKey(zoneId.split('@')[1] ?? '')
      if (!position) return
      const animalCounts = readAnimalHolderCounts(stored)
      const animalCount = sumAnimalCounts(animalCounts)
      if (animalCount <= 0) return
      const compact = compactAnimalCounts(animalCounts)
      const display: CardAnimalDisplay = {
        animalType: animalTypeFromCounts(compact),
        animalCount,
        animalCounts: compact,
        capacity: readCapacity(stored, animalCount),
        zoneId,
        isReorgDraft: false,
      }
      const allowedAnimalType = readAllowedAnimalType(stored)
      const allowedAnimalTypes = readAllowedAnimalTypes(stored)
      if (allowedAnimalType !== undefined) display.allowedAnimalType = allowedAnimalType
      if (allowedAnimalTypes) display.allowedAnimalTypes = allowedAnimalTypes
      map.set(positionKey(position), display)
    })
  })
  ;((player as PlayerWithCardAnimalZones | null | undefined)?.farmCardAnimalZones ?? [])
    .forEach((zone) => {
      if (zone.zoneType !== 'card' || !zone.farmPosition) return
      if (player?.id && zone.animalOwnerPlayerId && zone.animalOwnerPlayerId !== player.id) return
      const display: CardAnimalDisplay = {
        animalType: zone.animalType ?? null,
        animalCount: Math.max(0, zone.animalCount ?? 0),
        capacity: zone.capacity,
        zoneId: zone.id,
        isReorgDraft: false,
      }
      if (zone.animalCounts) display.animalCounts = zone.animalCounts
      if (zone.allowedAnimalType !== undefined) display.allowedAnimalType = zone.allowedAnimalType
      if (zone.allowedAnimalTypes) display.allowedAnimalTypes = zone.allowedAnimalTypes
      map.set(positionKey(zone.farmPosition), display)
    })
  animalReorg?.zones
    .filter((zone) => zone.zoneType === 'card' && zone.farmPosition)
    .forEach((zone) => {
      if (player?.id && zone.animalOwnerPlayerId && zone.animalOwnerPlayerId !== player.id) return
      map.set(positionKey(zone.farmPosition!), {
        animalType: zone.animalType ?? null,
        animalCount: Math.max(0, zone.animalCount ?? 0),
        ...(zone.animalCounts ? { animalCounts: zone.animalCounts } : {}),
        ...(zone.allowedAnimalType !== undefined ? { allowedAnimalType: zone.allowedAnimalType } : {}),
        ...(zone.allowedAnimalTypes ? { allowedAnimalTypes: zone.allowedAnimalTypes } : {}),
        capacity: zone.capacity,
        zoneId: zone.id,
        isReorgDraft: true,
      })
    })
  return map
}

const getReorgFenceExtraWood = (promptKey: string | undefined, spaceId: string) =>
  promptKey === 'ui.interactionFenceSelect' && spaceId === 'farm-redevelopment' ? 1 : 0

export const buildPendingChoiceFromReorgProgress = (
  progress: { promptKey?: string; choice: ActionChoiceOption[] },
  pendingAnimalReorg: PendingAnimalReorg,
): PendingChoice => ({
  promptKey: progress.promptKey,
  options: progress.choice,
  playerIndex: pendingAnimalReorg.playerIndex,
  spaceId: pendingAnimalReorg.spaceId,
  fenceExtraWood: getReorgFenceExtraWood(
    progress.promptKey,
    pendingAnimalReorg.spaceId,
  ),
})

export type PostReorgPlan =
  | { type: 'anytime' }
  | { type: 'harvestNextPlayer'; pendingPlayerIndex: number }
  | { type: 'harvestFinalize' }
  | { type: 'actionSpace'; hasTargetSpace: boolean }

export const buildPostReorgPlan = (params: {
  reorgSource: string
  nextState: GameState
  spaceId: string
  hasPendingAnimals: (player: GameState['players'][number]) => boolean
}): PostReorgPlan => {
  const { reorgSource, nextState, spaceId, hasPendingAnimals } = params
  if (reorgSource === 'anytime-reorg') {
    return { type: 'anytime' }
  }
  if (reorgSource === 'harvest-breed') {
    const pendingPlayerIndex = nextState.players.findIndex((player) =>
      hasPendingAnimals(player),
    )
    if (pendingPlayerIndex !== -1) {
      return { type: 'harvestNextPlayer', pendingPlayerIndex }
    }
    return { type: 'harvestFinalize' }
  }
  const hasTargetSpace = nextState.actionSpaces.some((item) => item.id === spaceId)
  return { type: 'actionSpace', hasTargetSpace }
}

export type ReorgEngineProgressPlan =
  | {
      type: 'choice'
      resetFenceSelection: boolean
      resetStableSelection: boolean
      pendingChoice: PendingChoice
    }
  | { type: 'fail'; errorKey: string }
  | { type: 'reorg'; playerIndex: number; spaceId: string }
  | { type: 'advance'; pendingNextPlayerIndex: number }

export const buildReorgEngineProgressPlan = (params: {
  progress: EngineProgress
  pendingAnimalReorg: PendingAnimalReorg
  players: GameState['players']
  currentPlayerIndex: number
  nextPlayerIndex: (
    players: GameState['players'],
    currentIndex: number,
  ) => number
}): ReorgEngineProgressPlan => {
  const { progress, pendingAnimalReorg, players, currentPlayerIndex, nextPlayerIndex } =
    params
  if (progress.type === 'choice') {
    return {
      type: 'choice',
      resetFenceSelection: progress.promptKey === 'ui.interactionFenceSelect',
      resetStableSelection: progress.promptKey === 'ui.interactionStableSelect',
      pendingChoice: buildPendingChoiceFromReorgProgress(progress, pendingAnimalReorg),
    }
  }
  if (progress.type === 'fail') {
    return { type: 'fail', errorKey: progress.errorKey }
  }
  if (progress.type === 'reorg') {
    return {
      type: 'reorg',
      playerIndex: progress.playerIndex,
      spaceId: progress.spaceId,
    }
  }
  return {
    type: 'advance',
    pendingNextPlayerIndex: nextPlayerIndex(players, currentPlayerIndex),
  }
}
