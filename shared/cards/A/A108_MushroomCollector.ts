import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A108_MushroomCollector } from '../../cards-display/A/A108_MushroomCollector'

const CARD_ID = A108_MushroomCollector.id

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

export const A108_MushroomCollector_impl = {
  listeners: [mushroomCollectorImmediatelyAfterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
