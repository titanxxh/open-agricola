import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { getFarmyardFields } from '../helpers/card-field'

const CARD_ID = 'A011_MudPatch'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { boar: 1 }),
  onComputeAnimalZones: (player, zones, _state) => {
    const emptyFields = getFarmyardFields(player).filter((field) => field.stacks.length === 0).length
    if (emptyFields === 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: emptyFields,
      animalType: 'boar',
      animalCount: 0,
      allowedAnimalType: 'boar',
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A011_MudPatch = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Mud Patch',
    deck: 'A',
    number: 11,
    category: 'FARM_PLANNER',
    desc: ['When you play this card, you immediately get 1 <PIG>. You can hold 1 <PIG> on each of your unplanted <FIELD> tiles.'],
  },
  impl: cardImpl,
})

export const A011_MudPatch_impl = A011_MudPatch.impl
