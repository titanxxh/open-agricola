import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../game/field'

const CARD_ID = 'A11_MudPatch'

/**
 * A11 Mud Patch — When you play this card, you immediately get 1 pig.
 * You can hold 1 pig on each of your unplanted field tiles.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { boar: 1 }),
  onComputeAnimalZones: (player, zones) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
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
})

export const A11_MudPatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Mud Patch',
  deck: 'A',
  number: 11,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['When you play this card, you immediately get 1 <PIG>. You can hold 1 <PIG> on each of your unplanted field tiles.'],
})
