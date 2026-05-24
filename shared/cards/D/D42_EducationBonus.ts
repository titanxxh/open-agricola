import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D42_EducationBonus } from '../../cards-display/D/D42_EducationBonus'

const CARD_ID = D42_EducationBonus.id

const GAINS = [null, 'grain', 'clay', 'reed', 'stone', 'vegetable'] as const

const listener: CardListenerRegistration = {
  id: 'D42-education-bonus-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const n = context.player.occupationPlayed.length
    if (n > 6) return
    if (n === 6) {
      const canPlow = context.player.fields.length < 5 // rough check for available farm tiles
      if (!canPlow) return
      return {
        flow: {
          type: 'leaf',
          actionId: 'plow',
          optional: true,
          sourceCard: CARD_ID,
        },
        sourceCard: CARD_ID,
      }
    }
    const resource = GAINS[n]
    if (!resource) return
    return { flow: gainLeaf(CARD_ID, { [resource]: 1 }), sourceCard: CARD_ID }
  },
}

export const D42_EducationBonus_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
