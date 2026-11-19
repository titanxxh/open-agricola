import type { GameState, InteractionRequest, PlayerState } from '../contract/types'
import { computeAnimalZones, getAllowedAnimalTypesForZone, prefillAnimalZones } from './animal-zones'

/** The same server-derived draft is used by actions and refreshed interactions. */
export const buildAnimalReorgRequest = (
  state: GameState,
  player: PlayerState,
  prefill = true,
): Extract<InteractionRequest, { kind: 'animal-reorg' }> => {
  const current = computeAnimalZones(player, state)
  const allowedTypesByZone = new Map(current
    .filter((zone) => zone.zoneType === 'card')
    .map((zone) => [zone.id, getAllowedAnimalTypesForZone(state, player, zone)]))
  const zones = prefill ? prefillAnimalZones(state, player, current) : current
  return {
    kind: 'animal-reorg',
    ...(prefill ? {} : { prefill: false }),
    zones: zones.map((zone) => ({
      id: zone.id,
      zoneType: zone.zoneType,
      cardId: zone.cardId,
      ...(zone.ownerPlayerId ? { ownerPlayerId: zone.ownerPlayerId } : {}),
      ...(zone.animalOwnerPlayerId ? { animalOwnerPlayerId: zone.animalOwnerPlayerId } : {}),
      ...(zone.displayOwnerName ? { displayOwnerName: zone.displayOwnerName } : {}),
      animalType: zone.animalType ?? null,
      animalCount: zone.animalCount ?? 0,
      ...(zone.animalCounts ? { animalCounts: zone.animalCounts } : {}),
      ...(zone.allowedAnimalType !== undefined ? { allowedAnimalType: zone.allowedAnimalType } : {}),
      ...(zone.zoneType === 'card' ? { allowedAnimalTypes: allowedTypesByZone.get(zone.id) } : {}),
      ...(zone.farmPosition ? { farmPosition: zone.farmPosition } : {}),
      ...(zone.countsFarmyardSpaceAsUnused !== undefined ? { countsFarmyardSpaceAsUnused: zone.countsFarmyardSpaceAsUnused } : {}),
      ...(zone.displaySource ? { displaySource: zone.displaySource } : {}),
      ...(zone.occupancyGroup ? { occupancyGroup: zone.occupancyGroup } : {}),
      ...(zone.occupiedZoneLimit !== undefined ? { occupiedZoneLimit: zone.occupiedZoneLimit } : {}),
      ...(zone.requiredEmptyZoneGroupIds ? { requiredEmptyZoneGroupIds: zone.requiredEmptyZoneGroupIds } : {}),
      capacity: zone.capacity,
      ...(zone.fixedAnimalCounts ? { fixedAnimalCounts: { ...zone.fixedAnimalCounts } } : {}),
    })),
  }
}
