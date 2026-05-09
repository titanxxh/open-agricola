import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A142_Cordmaker } from '../../cards-display/A/A142_Cordmaker'

const CARD_ID = A142_Cordmaker.id

/**
 * A142 Cordmaker:
 * scope 'any' -- when any player collects 2+ reed from the Reed Bank:
 *   - If the collecting player is the card owner: gain grain OR vegetable (xor choice)
 *   - If the collecting player is an opponent: optional grain OR vegetable
 */
const listener: CardListenerRegistration = {
  id: 'A142-cordmaker-any-collect-reed',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'reed-bank') return
    if (context.result?.type !== 'ok') return
    const reedGained = context.result.resourcesGained?.reed ?? 0
    if (reedGained < 2) return

    const ownerPlayer = context.ownerPlayer ?? context.player
    const triggerPlayer = context.triggerPlayer ?? context.player
    const isOwner = ownerPlayer.id === triggerPlayer.id

    return {
      flow: {
        type: 'xor',
        optional: !isOwner,
        children: [
          gainLeaf(CARD_ID, { grain: 1 }),
          payGainFlow({ cardId: CARD_ID, cost: { food: 2 }, gain: { vegetable: 1 } }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A142_Cordmaker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
