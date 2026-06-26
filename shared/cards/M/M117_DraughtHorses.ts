import { defineMinorCard } from '../card-source'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { isWoodAccumulationSpaceId } from '../helpers/action-space-categories'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'

const CARD_ID = 'M117_DraughtHorses'

const afterWoodCollectListener: CardListenerRegistration = {
  id: 'M117-draught-horses-after-wood-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context) => {
    if ((context.player.resources.horse ?? 0) < 1 || (context.player.resources.food ?? 0) < 1) return
    const wood = context.eventQuery.filter('resource.moved', (event) =>
      event.from.kind === 'actionSpace' &&
      isWoodAccumulationSpaceId(event.from.spaceId) &&
      event.to.kind === 'player' &&
      event.to.playerId === context.player.id,
    ).reduce((sum, event) => sum + (event.resources.wood ?? 0), 0)
    const bonus = wood === 3 ? 1 : wood >= 4 ? 2 : 0
    if (bonus <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          gainLeaf(CARD_ID, { wood: bonus }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterWoodCollectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M117_DraughtHorses = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Draught-horses",
    deck: "M",
    number: 117,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: [
        "Each time you take exactly 3 or at least 4 wood from an accumulation space, if you have at least 1 horse, you can pay exactly 1 food to get 1 or 2 additional wood, respectively."
    ],
    cost: {},
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M117_DraughtHorses_impl = M117_DraughtHorses.impl
