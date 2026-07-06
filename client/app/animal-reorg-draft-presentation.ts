import { useCallback, useMemo, useState } from 'react'
import { ALL_ANIMAL_KEYS, type AnimalKey } from '../../shared/contract/animals'
import type { GameState, InteractionAnimalReorgZone } from '../../shared/contract/types'
import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import type { AnimalReorgState, PendingAnimalReorg } from '../types/ui'
import {
  computeReorgAvailableAnimals,
  shouldShowAnimalDiscardPrompt,
  wouldExceedExclusiveCardZoneLimit,
  type AnimalTotals,
} from './hooks/use-animal-reorg-flow'

type ReorgAnimalType = AnimalKey

export type AnimalReorgSubmitDraft = {
  animalReorgZones?: readonly InteractionAnimalReorgZone[]
}

export type AnimalReorgDraftPresentationInput = {
  state: GameState | null | undefined
  pendingAnimalReorg: PendingAnimalReorg | null
}

const REORG_ANIMAL_TYPES: ReorgAnimalType[] = [...ALL_ANIMAL_KEYS]

const emptyAnimalTotals = (): AnimalTotals => ({ sheep: 0, boar: 0, cattle: 0, horse: 0 })

const compactAnimalCounts = (counts: Record<ReorgAnimalType, number>) => {
  const compact: Partial<Record<ReorgAnimalType, number>> = {}
  for (const type of REORG_ANIMAL_TYPES) {
    if (counts[type] > 0) compact[type] = counts[type]
  }
  return compact
}

const animalCountsTotal = (counts: Partial<Record<ReorgAnimalType, number>>) =>
  REORG_ANIMAL_TYPES.reduce((sum, type) => sum + Math.max(0, counts[type] ?? 0), 0)

const singleAnimalType = (counts: Partial<Record<ReorgAnimalType, number>>) => {
  const occupied = REORG_ANIMAL_TYPES.filter((type) => (counts[type] ?? 0) > 0)
  return occupied.length === 1 ? occupied[0]! : null
}

const zoneAnimalCounts = (zone: InteractionAnimalReorgZone) => {
  const counts = emptyAnimalTotals()
  for (const type of REORG_ANIMAL_TYPES) {
    counts[type] = Math.max(0, Math.floor(zone.animalCounts?.[type] ?? 0))
  }
  if (animalCountsTotal(counts) > 0) return counts
  if (zone.animalType) counts[zone.animalType] = Math.max(0, Math.floor(zone.animalCount ?? 0))
  return counts
}

const cardZoneAllowsMixedAnimals = (zone: InteractionAnimalReorgZone) =>
  zone.zoneType === 'card' && zone.allowedAnimalType === null

const addAnimalCounts = (
  target: Record<ReorgAnimalType, number>,
  counts: Partial<Record<ReorgAnimalType, number>>,
) => {
  for (const type of REORG_ANIMAL_TYPES) {
    target[type] += counts[type] ?? 0
  }
}

export const useAnimalReorgDraftPresentation = ({
  state,
  pendingAnimalReorg,
}: AnimalReorgDraftPresentationInput) => {
  const [animalReorg, setAnimalReorg] = useState<AnimalReorgState | null>(null)

  const syncFromInteraction = useCallback((interaction: ClientInteractionState) => {
    if (
      interaction.stateId === 'wait' &&
      interaction.request.kind === 'animal-reorg'
    ) {
      setAnimalReorg({
        zones: interaction.request.zones,
        confirmDiscard: false,
      })
      return
    }
    setAnimalReorg(null)
  }, [])

  const reset = useCallback(() => {
    setAnimalReorg(null)
  }, [])

  const reorgAvailable = useMemo(() => {
    if (!state) return null
    const playerIndex = pendingAnimalReorg?.playerIndex ?? state.currentPlayerIndex
    const player = state.players[playerIndex]
    if (!player) return null
    return computeReorgAvailableAnimals(player)
  }, [pendingAnimalReorg, state])

  const reorgTotals = useMemo(() => {
    if (!animalReorg) return emptyAnimalTotals()
    return animalReorg.zones.reduce((acc, zone) => {
      addAnimalCounts(acc, zoneAnimalCounts(zone))
      return acc
    }, emptyAnimalTotals())
  }, [animalReorg])

  const hasReorgOverflow = useMemo(() => {
    if (!reorgAvailable) return false
    return REORG_ANIMAL_TYPES.some((animal) => reorgTotals[animal] > reorgAvailable[animal])
  }, [reorgAvailable, reorgTotals])

  const adjustAnimal = useCallback((zoneId: string, animalType: ReorgAnimalType, delta: number) => {
    setAnimalReorg((prev) => {
      if (!prev || !pendingAnimalReorg || !state) return prev
      const player = state.players[pendingAnimalReorg.playerIndex]
      if (!player) return prev
      const current = prev.zones.find((zone) => zone.id === zoneId)
      if (!current) return prev
      const capacity = current.capacity
      const totals = prev.zones.reduce((acc, zone) => {
        addAnimalCounts(acc, zoneAnimalCounts(zone))
        return acc
      }, emptyAnimalTotals())
      const available = computeReorgAvailableAnimals(player)

      if (delta > 0) {
        if (wouldExceedExclusiveCardZoneLimit(prev.zones, zoneId)) return prev
        const baseTotals = { ...totals }
        const currentCounts = zoneAnimalCounts(current)
        addAnimalCounts(baseTotals, {
          sheep: -currentCounts.sheep,
          boar: -currentCounts.boar,
          cattle: -currentCounts.cattle,
          horse: -(currentCounts.horse ?? 0),
        })
        const remaining = available[animalType] - baseTotals[animalType]
        if (remaining <= 0) return prev

        if (cardZoneAllowsMixedAnimals(current)) {
          const nextCounts = { ...currentCounts }
          if (animalCountsTotal(nextCounts) >= capacity) return prev
          nextCounts[animalType] += 1
          const nextTotal = animalCountsTotal(nextCounts)
          const zones = prev.zones.map((zone) => {
            if (zone.id !== zoneId) return zone
            return {
              ...zone,
              animalCounts: compactAnimalCounts(nextCounts),
              animalType: singleAnimalType(nextCounts),
              animalCount: nextTotal,
            }
          })
          return { ...prev, zones, confirmDiscard: false }
        }

        const nextCount =
          current.animalType === animalType
            ? Math.min(capacity, current.animalCount + 1)
            : Math.min(capacity, 1)
        if (nextCount <= 0) return prev
        const zones = prev.zones.map((zone) => {
          if (zone.id !== zoneId) return zone
          const { animalCounts: _animalCounts, ...rest } = zone
          return {
            ...rest,
            animalType,
            animalCount: nextCount,
          }
        })
        return { ...prev, zones, confirmDiscard: false }
      }

      if (cardZoneAllowsMixedAnimals(current)) {
        const currentCounts = zoneAnimalCounts(current)
        if (currentCounts[animalType] <= 0) return prev
        const nextCounts = { ...currentCounts, [animalType]: currentCounts[animalType] - 1 }
        const nextTotal = animalCountsTotal(nextCounts)
        const zones = prev.zones.map((zone) => {
          if (zone.id !== zoneId) return zone
          return {
            ...zone,
            animalCounts: compactAnimalCounts(nextCounts),
            animalType: singleAnimalType(nextCounts),
            animalCount: nextTotal,
          }
        })
        return { ...prev, zones, confirmDiscard: false }
      }

      if (current.animalType !== animalType || current.animalCount <= 0) {
        return prev
      }
      const nextCount = Math.max(0, current.animalCount - 1)
      const zones = prev.zones.map((zone) => {
        if (zone.id !== zoneId) return zone
        const { animalCounts: _animalCounts, ...rest } = zone
        return {
          ...rest,
          animalType: nextCount > 0 ? animalType : null,
          animalCount: nextCount,
        }
      })
      return { ...prev, zones, confirmDiscard: false }
    })
  }, [pendingAnimalReorg, state])

  const confirm = useCallback((
    reorgRemaining: AnimalTotals | null | undefined,
    onConfirm: (value: string) => void,
  ) => {
    if (shouldShowAnimalDiscardPrompt(animalReorg, reorgRemaining)) {
      setAnimalReorg((prev) => prev ? { ...prev, confirmDiscard: true } : prev)
      return
    }
    onConfirm('confirm')
  }, [animalReorg])

  const cancelDiscardPrompt = useCallback(() => {
    setAnimalReorg((prev) => prev ? { ...prev, confirmDiscard: false } : prev)
  }, [])

  const submitDraft = useMemo<AnimalReorgSubmitDraft>(() => ({
    animalReorgZones: animalReorg?.zones,
  }), [animalReorg?.zones])

  return {
    animalReorg,
    isActive: !!animalReorg,
    reorgAvailable,
    reorgTotals,
    hasReorgOverflow,
    submitDraft,
    syncFromInteraction,
    reset,
    controls: {
      adjustAnimal,
      confirm,
      cancelDiscardPrompt,
    },
  }
}
