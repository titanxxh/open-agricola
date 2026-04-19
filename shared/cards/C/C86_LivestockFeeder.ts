import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C86_LivestockFeeder'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
  onComputeAnimalZones: (player, zones) => {
    const grain = player.resources.grain ?? 0
    if (grain <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: grain,
      animalType: null,
      animalCount: 0,
    })
  },
})

export const C86_LivestockFeeder = new Occupation({
  id: "C86_LivestockFeeder",
  name: "Livestock Feeder",
  deck: "C",
  number: 86,
  category: "FARM_PLANNER",
  desc: ["When you play this card, you immediately get 1 <GRAIN>. This card can hold 1 animal of any type for each <GRAIN> in your supply."],
  cost: {},
  occupationPrerequisites: {"min":2},
  players: "1+",
})
