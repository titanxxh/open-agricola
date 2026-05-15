import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C86_LivestockFeeder'

export const C86_LivestockFeeder_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
  onComputeAnimalZones: (player, zones, _state) => {
    const grain = player.resources.grain ?? 0
    if (grain <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      cardId: CARD_ID,
      capacity: grain,
      animalType: null,
      animalCount: 0,
    })
  },
  /**
   * BGA `Cards/C/C86_LivestockFeeder.php::getInvalidAnimals` returns []:
   * capacity dynamically reflects grain count via onPlayerComputeDropZones.
   * Mirror BGA exactly.
   */
  getInvalidAnimals: () => [],
},
  reaches: [] as readonly string[],
} satisfies CardImpl
