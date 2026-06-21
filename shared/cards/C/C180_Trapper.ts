import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { Resource } from '../../contract/types'
import { isWoodAccumulationSpaceId } from '../helpers/action-space-categories'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C180_Trapper'

const rewardByOccupiedWoodCount: Partial<Record<number, Partial<Resource>>> = {
  2: { sheep: 1 },
  3: { boar: 1 },
  4: { cattle: 1 },
}

const occupiedWoodCount = (context: CardListenerContext) =>
  context.state.actionSpaces.filter((space) => isWoodAccumulationSpaceId(space.id) && space.takenBy.length > 0).length

const listener: CardListenerRegistration = {
  id: 'C180-trapper-after-wood',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpaceId(context.space?.id)) return
    if ((context.player.resources.food ?? 0) < 1) return
    const gain = rewardByOccupiedWoodCount[occupiedWoodCount(context)]
    if (!gain) return
    return {
      ...payGainNode({
        cardId: CARD_ID,
        cost: { food: 1 },
        gain,
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C180_Trapper = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Trapper',
    deck: 'C',
    number: 180,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time after you use a wood accumulation space, if this is the 2nd/3rd/4th occupied wood accumulation space that round, you can buy 1 sheep/wild boar/cattle for 1 food.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C180_Trapper_impl = C180_Trapper.impl
