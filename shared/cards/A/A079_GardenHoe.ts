import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isUnconditionalSow } from '../../actions/effects/sow'
import type { CardImpl } from '../registry'
import type { FarmSownEvent } from '../../contract/events'

const CARD_ID = 'A079_GardenHoe'
const listener: CardListenerRegistration = {
  id: 'A79-garden-hoe-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isUnconditionalSow(context.actionContext)) return
    const sowedVegetable = (context.actionEvents ?? context.transactionEvents).some(
      (event) => event.type === 'farm.sown' && (event as Pick<FarmSownEvent, 'sows'>).sows.some((sow) =>
        sow.location.kind === 'field' &&
        sow.location.playerId === context.player.id &&
        sow.crop === 'vegetable',
      ),
    )
    if (!sowedVegetable) return
    return { flow: gainLeaf(CARD_ID, { clay: 1, stone: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A079_GardenHoe = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Garden Hoe",
    deck: "A",
    number: 79,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Each time you take an unconditional __Sow__ action planting <VEGETABLE> in at least 1 <FIELD>, you get 1 <CLAY> and 1 <STONE>."],
    cost: {"wood":1},
  },
  impl: cardImpl,
})

export const A079_GardenHoe_impl = A079_GardenHoe.impl
