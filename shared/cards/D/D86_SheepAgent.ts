import type { CardImpl } from '../registry'
import { D86_SheepAgent } from '../../cards-display/D/D86_SheepAgent'
import { collectCardDefinitionsAs } from '../helpers/card-type'

const CARD_ID = D86_SheepAgent.id

export const D86_SheepAgent_impl = {
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
