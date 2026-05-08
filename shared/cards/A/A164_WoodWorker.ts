import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A164_WoodWorker } from '../../cards-display/A/A164_WoodWorker'
export { A164_WoodWorker }

const CARD_ID = A164_WoodWorker.id

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A164-wood-worker-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { wood: 1 },
      gain: { sheep: 1 },
      choiceLabelKey: 'occupations.A164_WoodWorker.name',
    })
  },
}

export const A164_WoodWorker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
