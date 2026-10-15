import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getActionNewlyUsedTiles } from '../helpers/farmyard-events'
import type { CardImpl } from '../registry'

const CARD_ID = 'A073_AgriculturalFertilizers'

const afterListener: CardListenerRegistration = {
  id: 'A73-agri-fert-after',
  cardIds: [CARD_ID],
  actions: ['construct', 'fence', 'stables'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getActionNewlyUsedTiles(context).length < 2) return
    return {
      flow: { type: 'leaf', actionId: 'sow', optional: true, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A073_AgriculturalFertilizers = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Agricultural Fertilizers',
    deck: 'A',
    number: 73,
    category: 'CROP_PROVIDER',
    desc: [
        'Each time after you turn at least 2 unused spaces into used spaces in one action, you get an additional __Sow__ action.',
      ],
    cost: {},
    prerequisite: '1 Pasture',
  },
  impl: cardImpl,
})

export const A073_AgriculturalFertilizers_impl = A073_AgriculturalFertilizers.impl
