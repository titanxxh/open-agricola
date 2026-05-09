import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B122_Mineralogist } from '../../cards-display/B/B122_Mineralogist'

const CARD_ID = B122_Mineralogist.id

/**
 * B122 Mineralogist — Each time you use a clay/stone accumulation space,
 * you also get 1 of the other good.
 *
 * BGA (B122_Mineralogist.php): isBeforeCollectEvent CLAY/STONE →
 * onPlayerPlaceFarmer returns gainNode of the opposite resource.
 */
const listener: CardListenerRegistration = {
  id: 'B122-mineralogist-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    const isClay = (gainPerRound.clay ?? 0) > 0
    const isStone = (gainPerRound.stone ?? 0) > 0
    if (!isClay && !isStone) return
    const gain = isClay ? { stone: 1 } : { clay: 1 }
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

export const B122_Mineralogist_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
