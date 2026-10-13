type AnimalZoneOccupancy = {
  occupancyGroup?: string
  cardId?: string
  ownerPlayerId?: string
  occupiedZoneLimit?: number
  animalCount?: number
}

export const animalZoneOccupancyGroup = (zone: Pick<AnimalZoneOccupancy, 'occupancyGroup' | 'cardId' | 'ownerPlayerId'>): string | undefined =>
  zone.occupancyGroup ?? (zone.cardId ? JSON.stringify([zone.cardId, zone.ownerPlayerId]) : undefined)

export const areZoneOccupancyLimitsSatisfied = (
  zones: readonly AnimalZoneOccupancy[],
): boolean => zones.every(zone => {
  const group = animalZoneOccupancyGroup(zone)
  return group === undefined || zone.occupiedZoneLimit === undefined || zones.filter(candidate =>
    animalZoneOccupancyGroup(candidate) === group && (candidate.animalCount ?? 0) > 0,
  ).length <= zone.occupiedZoneLimit
})

