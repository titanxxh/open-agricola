import { defineOccupationCard } from '../card-source'
import { getPastureStableCount } from '../../domain/pasture'
import type { AnimalZone } from '../../domain'
import type { PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B115_TinsmithMaster'

/**
 * B115 Tinsmith Master (Occupation):
 *
 * EFFECT 1 (passive): Each pasture WITHOUT a stable gets +1 animal capacity.
 *   - Implemented via onComputeAnimalZones
 *
 * EFFECT 2 (Sow amount): each sown grain / vegetable field may get 1 more good,
 *   chosen inside the Sow before placement.
 */

const cardImpl = {
  effect: {
  id: CARD_ID,
  // Any grain or vegetable field, including Card Fields; the player chooses per field.
  modifySowAmount: ({ crop, target }) =>
    (crop === 'grain' || crop === 'vegetable') && target.kind !== 'extra'
      ? { delta: 1, optional: true }
      : undefined,
  onComputeAnimalZones: (player: PlayerState, zones: AnimalZone[], _state) => {
    for (const zone of zones) {
      if (zone.zoneType !== 'pasture') continue
      const pastureIndex = zone.pastureIndex
      if (pastureIndex === undefined) continue
      const pasture = player.pastures[pastureIndex]
      if (!pasture) continue
      if (getPastureStableCount(player, pasture) === 0) {
        zone.capacity += 1
      }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B115_TinsmithMaster = defineOccupationCard({
  presentation: { stack: true },
  meta: {
    id: CARD_ID,
    name: 'Tinsmith Master',
    deck: 'B',
    number: 115,
    category: 'CROP_PROVIDER',
    desc: ['You can hold 1 additional animal in each pasture without a <STABLE>. Each time you sow in a <FIELD>, you can place 1 additional crop of the respective type in that <FIELD>.'],
    cost: {},
    players: '1+',
    implemented: true,
  },
  impl: cardImpl,
})

export const B115_TinsmithMaster_impl = B115_TinsmithMaster.impl
