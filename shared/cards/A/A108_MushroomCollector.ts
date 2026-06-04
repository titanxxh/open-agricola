import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A108_MushroomCollector'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0

const mushroomCollectorImmediatelyAfterListener: CardListenerRegistration = {
  id: 'A108-mushroom-collector-immediately-after',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { wood: 1 },
      gain: { food: 2 },
      choiceLabelKey: 'occupations.A108_MushroomCollector.name',
    })
  },
}

const cardImpl = {
  listeners: [mushroomCollectorImmediatelyAfterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A108_MushroomCollector = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Mushroom Collector",
    deck: "A",
    number: 108,
    category: "FOOD_PROVIDER",
    desc: ["Immediately after each time you use a wood accumulation space, you can exchange 1 <WOOD> for 2 <FOOD>. If you do, place the <WOOD> on the accumulation space."],
    cost: {},
    players: "1+",
    waresSalesmanGains: [{ wood: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const A108_MushroomCollector_impl = A108_MushroomCollector.impl
