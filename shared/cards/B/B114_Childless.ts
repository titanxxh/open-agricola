import { Occupation } from '../types'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'B114_Childless'

export const B114_Childless = new Occupation({
  id: CARD_ID,
  name: 'Childless',
  deck: 'B',
  number: 114,
  category: 'CROP_PROVIDER',
  desc: ['At the start of each round, if you have at least 3 rooms but only 2 people, you get 1 <FOOD> and 1 crop of your choice (<GRAIN> or <VEGETABLE>)'],
  cost: {},
  players: '1+',
})

export const B114_Childless_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const roomCount = player.roomTiles.length
    if (roomCount < 3) return
    if (familySize(player) !== 2) return
    return {
      type: 'xor',
      children: [
        {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 1, grain: 1 },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: { resourcesGained: { food: 1, grain: 1 } },
        },
        {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 1, vegetable: 1 },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: { resourcesGained: { food: 1, vegetable: 1 } },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
