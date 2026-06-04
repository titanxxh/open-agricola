import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import { collectCardDefinitionsAs } from '../helpers/card-type'

const CARD_ID = 'D86_SheepAgent'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones, _state) => {
      const occupationDefinitions = collectCardDefinitionsAs(player, 'occupation')
      const animalHolderOccupationCount = occupationDefinitions.filter((def) =>
        def.id !== CARD_ID && def.animalHolder === true,
      ).length
      const capacity = occupationDefinitions.length - animalHolderOccupationCount
      if (capacity <= 0) return
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        capacity,
        animalType: 'sheep',
        animalCount: 0,
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D86_SheepAgent = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sheep Agent',
    deck: 'D',
    number: 86,
    category: 'FARM_PLANNER',
    desc: ['You can keep 1 <SHEEP> on this card for each occupation card in front of you (including this one), unless it is already able to hold animals.'],
    cost: {},
    animalHolder: true,
    players: '1+',
  },
  impl: cardImpl,
})

export const D86_SheepAgent_impl = D86_SheepAgent.impl
