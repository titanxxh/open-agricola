import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A11_MudPatch'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { boar: 1 }),
  onComputeAnimalZones: (player, zones, _state) => {
    const emptyFields = player.fields.filter(f => fieldIsEmpty(f)).length
    if (emptyFields === 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: emptyFields,
      animalType: 'boar',
      animalCount: 0,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A11_MudPatch = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Mud Patch',
    deck: 'A',
    number: 11,
    category: 'FARM_PLANNER',
    desc: ['When you play this card, you immediately get 1 <PIG>. You can hold 1 <PIG> on each of your unplanted field tiles.'],
  },
  impl: cardImpl,
})

export const A11_MudPatch_impl = A11_MudPatch.impl
