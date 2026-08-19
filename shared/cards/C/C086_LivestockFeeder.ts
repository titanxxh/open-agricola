import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C086_LivestockFeeder'

const cardImpl = {
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
      allowedAnimalType: null,
    })
  },
  /**
   * The reference `Cards/C/the reference::getInvalidAnimals` returns []:
   * capacity dynamically reflects grain count via onPlayerComputeDropZones.
   * Mirror the reference exactly.
   */
  getInvalidAnimals: () => [],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C086_LivestockFeeder = defineOccupationCard({
  meta: {
    id: "C086_LivestockFeeder",
    name: "Livestock Feeder",
    deck: "C",
    number: 86,
    category: "FARM_PLANNER",
    desc: ["When you play this card, you immediately get 1 <GRAIN>. This card can hold 1 animal of any type for each <GRAIN> in your supply."],
    cost: {},
    animalHolder: true,
    occupationPrerequisites: {"min":2},
    players: "1+",
  },
  impl: cardImpl,
})

export const C086_LivestockFeeder_impl = C086_LivestockFeeder.impl
