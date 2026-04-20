import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E126_TaxCollector'

export const E126_TaxCollector = new Occupation({
  id: CARD_ID,
  name: 'Tax Collector',
  deck: 'E',
  number: 126,
  category: 'BUILDING_RESOURCES_ALL',
  desc: ['Once you live in a stone house, at the start of each round, you get your choice of 2 <WOOD>, 2 <CLAY>, 1 <REED>, or 1 <STONE>.'],
  cost: {},
  players: '1+',
})

export const E126_TaxCollector_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'stone') return
    return {
      type: 'xor',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'gain', params: { wood: 2 }, sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionResourceExchange', choiceLabelParams: { resourcesGained: { wood: 2 } } },
        { type: 'leaf', actionId: 'gain', params: { clay: 2 }, sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionResourceExchange', choiceLabelParams: { resourcesGained: { clay: 2 } } },
        { type: 'leaf', actionId: 'gain', params: { reed: 1 }, sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionResourceExchange', choiceLabelParams: { resourcesGained: { reed: 1 } } },
        { type: 'leaf', actionId: 'gain', params: { stone: 1 }, sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionResourceExchange', choiceLabelParams: { resourcesGained: { stone: 1 } } },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
