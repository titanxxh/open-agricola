import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A119_FirewoodCollector'

const TRIGGER_SPACES = new Set(['farmland', 'grain-seeds', 'grain-utilization', 'cultivation'])

const listener: CardListenerRegistration = {
  id: 'A119-firewood-collector-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !TRIGGER_SPACES.has(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A119_FirewoodCollector = defineOccupationCard({
  meta: {
    id: "A119_FirewoodCollector",
    name: "Firewood Collector",
    deck: "A",
    number: 119,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Each time you use the __Farmland__, __Grain Seeds__, __Grain Utilization__, or __Cultivation__ action space, at the end of that turn, you get 1 <WOOD>."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const A119_FirewoodCollector_impl = A119_FirewoodCollector.impl
