import type { PlayerState, Pasture } from '../../game/types'
import { positionKey } from '../../game/farm'

/**
 * Returns the pasture ID that E33_BeaverColony blocks (cannot hold animals).
 * Picks the stabled pasture with the smallest normal capacity.
 * Returns undefined if E33 is not in play or no stabled pastures exist.
 */
export const getBlockedPastureId = (player: PlayerState): string | undefined => {
  if (!player.minorPlayed.includes('E33_BeaverColony')) return undefined
  const stabledPastures = player.pastures.filter((p) => p.stables > 0)
  if (stabledPastures.length === 0) return undefined
  return stabledPastures.reduce((smallest, p) => {
    const sCap = smallest.size * 2 * Math.pow(2, smallest.stables)
    const pCap = p.size * 2 * Math.pow(2, p.stables)
    return pCap < sCap ? p : smallest
  }).id
}

export const getPastureCapacity = (pasture: Pasture, blockedPastureId?: string) =>
  pasture.id === blockedPastureId ? 0 : pasture.size * 2 * Math.pow(2, pasture.stables)

export const getLooseStableKeys = (player: PlayerState) => {
  const pastureTiles = new Set(
    player.pastures.flatMap((pasture) =>
      (pasture.tiles ?? []).map((tile) => positionKey(tile)),
    ),
  )
  return player.stableTiles
    .map((tile) => positionKey(tile))
    .filter((key) => !pastureTiles.has(key))
}

export const getAssignedAnimalCount = (player: PlayerState) => {
  const pastureCount = player.pastures.reduce(
    (sum, pasture) => sum + pasture.animalCount,
    0,
  )
  const houseCount =
    player.houseAnimalType && player.houseAnimalCount > 0
      ? player.houseAnimalCount
      : 0
  const stableCount = Object.values(player.stableAnimals ?? {}).filter(Boolean).length
  return pastureCount + houseCount + stableCount
}

export const getTotalAnimalCapacity = (player: PlayerState) => {
  const blocked = getBlockedPastureId(player)
  return player.pastures.reduce((sum, pasture) => sum + getPastureCapacity(pasture, blocked), 0) +
    1 +
    getLooseStableKeys(player).length
}

export const enforceAnimalCapacity = (player: PlayerState) => {
  const blocked = getBlockedPastureId(player)
  const totals = {
    sheep: player.resources.sheep,
    boar: player.resources.boar,
    cattle: player.resources.cattle,
  }
  const looseStableKeys = getLooseStableKeys(player)
  const stableAnimals: Record<string, 'sheep' | 'boar' | 'cattle' | null> = {}
  looseStableKeys.forEach((key) => {
    stableAnimals[key] = player.stableAnimals?.[key] ?? null
  })
  player.pastures = player.pastures.map((pasture) => {
    const capacity = getPastureCapacity(pasture, blocked)
    if (pasture.animalType) {
      const remaining = totals[pasture.animalType]
      const count = Math.min(remaining, capacity)
      totals[pasture.animalType] -= count
      return {
        ...pasture,
        animalCount: count,
        animalType: count > 0 ? pasture.animalType : null,
      }
    }
    return { ...pasture, animalCount: 0, animalType: null }
  })
  const houseCount =
    player.houseAnimalType && totals[player.houseAnimalType] > 0
      ? Math.min(1, totals[player.houseAnimalType])
      : 0
  if (player.houseAnimalType) {
    totals[player.houseAnimalType] -= houseCount
  }
  player.houseAnimalCount = houseCount
  if (houseCount === 0) {
    player.houseAnimalType = null
  }
  looseStableKeys.forEach((key) => {
    const type = stableAnimals[key]
    if (!type) return
    const remaining = totals[type]
    const count = Math.min(remaining, 1)
    totals[type] -= count
    stableAnimals[key] = count > 0 ? type : null
  })
  const fillPasture = (
    pasture: Pasture,
    animalType: 'sheep' | 'boar' | 'cattle',
  ) => {
    const capacity = getPastureCapacity(pasture, blocked)
    const remaining = totals[animalType]
    if (remaining <= 0) return pasture
    const count = Math.min(remaining, capacity)
    totals[animalType] -= count
    return {
      ...pasture,
      animalType,
      animalCount: count,
    }
  }
  player.pastures = player.pastures.map((pasture) => {
    if (pasture.animalType) return pasture
    let next = fillPasture(pasture, 'sheep')
    if (next.animalType) return next
    next = fillPasture(pasture, 'boar')
    if (next.animalType) return next
    next = fillPasture(pasture, 'cattle')
    return next
  })
  if (!player.houseAnimalType) {
    if (totals.sheep > 0) {
      player.houseAnimalType = 'sheep'
      player.houseAnimalCount = 1
      totals.sheep -= 1
    } else if (totals.boar > 0) {
      player.houseAnimalType = 'boar'
      player.houseAnimalCount = 1
      totals.boar -= 1
    } else if (totals.cattle > 0) {
      player.houseAnimalType = 'cattle'
      player.houseAnimalCount = 1
      totals.cattle -= 1
    }
  }
  looseStableKeys.forEach((key) => {
    if (stableAnimals[key]) return
    if (totals.sheep > 0) {
      stableAnimals[key] = 'sheep'
      totals.sheep -= 1
      return
    }
    if (totals.boar > 0) {
      stableAnimals[key] = 'boar'
      totals.boar -= 1
      return
    }
    if (totals.cattle > 0) {
      stableAnimals[key] = 'cattle'
      totals.cattle -= 1
    }
  })
  player.stableAnimals = stableAnimals
  player.resources.sheep = player.pastures
    .filter((pasture) => pasture.animalType === 'sheep')
    .reduce((sum, pasture) => sum + pasture.animalCount, 0)
  if (player.houseAnimalType === 'sheep') {
    player.resources.sheep += player.houseAnimalCount
  }
  Object.values(stableAnimals).forEach((type) => {
    if (type === 'sheep') player.resources.sheep += 1
  })
  player.resources.boar = player.pastures
    .filter((pasture) => pasture.animalType === 'boar')
    .reduce((sum, pasture) => sum + pasture.animalCount, 0)
  if (player.houseAnimalType === 'boar') {
    player.resources.boar += player.houseAnimalCount
  }
  Object.values(stableAnimals).forEach((type) => {
    if (type === 'boar') player.resources.boar += 1
  })
  player.resources.cattle = player.pastures
    .filter((pasture) => pasture.animalType === 'cattle')
    .reduce((sum, pasture) => sum + pasture.animalCount, 0)
  if (player.houseAnimalType === 'cattle') {
    player.resources.cattle += player.houseAnimalCount
  }
  Object.values(stableAnimals).forEach((type) => {
    if (type === 'cattle') player.resources.cattle += 1
  })
}
