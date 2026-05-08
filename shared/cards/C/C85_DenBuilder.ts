import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C85_DenBuilder } from '../../cards-display/C/C85_DenBuilder'

const CARD_ID = C85_DenBuilder.id

const anytimeListener: CardListenerRegistration = {
  id: 'C85-den-builder-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.houseType === 'wood') return
    if (context.player.resources.grain < 1 || context.player.resources.food < 2) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1, food: 2 } }),
          { type: 'leaf', actionId: 'build-farmhand-room', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.C85_DenBuilder.anytime',
    }
  },
}

export const C85_DenBuilder_impl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
