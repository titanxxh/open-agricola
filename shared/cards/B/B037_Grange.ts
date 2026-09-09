import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getFarmyardFields } from '../helpers/card-field'
import { getPlacedAnimalsByType } from '../../domain/animal-zones'
import type { CardImpl } from '../registry'

const CARD_ID = 'B037_Grange'

const cardImpl = {
  prerequisiteCheck: (player, state) => {
    if (!state) return false
    const animals = getPlacedAnimalsByType(player, state)
    return getFarmyardFields(player).length >= 6
      && animals.sheep >= 1 && animals.boar >= 1 && animals.cattle >= 1
  },
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B037_Grange = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Grange',
    deck: 'B',
    number: 37,
    category: 'POINTS_PROVIDER',
    desc: ['When you play this card, you immediately get 1 <FOOD>.'],
    cost: {},
    vp: 3,
    prerequisite: '6 Field Tiles and All Animal Types',
  },
  impl: cardImpl,
})

export const B037_Grange_impl = B037_Grange.impl
