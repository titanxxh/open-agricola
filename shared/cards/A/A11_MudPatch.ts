import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A11_MudPatch'

export const A11_MudPatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Mud Patch',
  deck: 'A',
  number: 11,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you immediately get 1 <PIG>. You can hold 1 <PIG> on each of your unplanted field tiles.'],
})

export const A11_MudPatch_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { boar: 1 }),
  onComputeAnimalZones: (player, zones) => {
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
