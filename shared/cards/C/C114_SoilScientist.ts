import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C114_SoilScientist } from '../../cards-display/C/C114_SoilScientist'

const CARD_ID = C114_SoilScientist.id

const listener: CardListenerRegistration = {
  id: 'C114-soil-scientist-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    const isClay = (gainPerRound.clay ?? 0) > 0
    const isStone = (gainPerRound.stone ?? 0) > 0
    if (!isClay && !isStone) return

    if (isClay) {
      return returnToSpaceThenGainFlow({
        cardId: CARD_ID,
        cost: { stone: 1 },
        gain: { grain: 2 },
      })
    } else {
      return returnToSpaceThenGainFlow({
        cardId: CARD_ID,
        cost: { clay: 2 },
        gain: { vegetable: 1 },
      })
    }
  },
}

export const C114_SoilScientist_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
