import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { countTriggerCardsAs } from '../helpers/trigger-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'D042_EducationBonus'
const GAINS = [null, 'grain', 'clay', 'reed', 'stone', 'vegetable'] as const

const listener: CardListenerRegistration = {
  id: 'D42-education-bonus-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const n = countTriggerCardsAs(context, context.player, 'occupation')
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D042_EducationBonus = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Education Bonus',
    deck: 'D',
    number: 42,
    category: 'GOODS_PROVIDER',
    desc: [
        'After you play your 1st/2nd/3rd/4th/5th/6th occupation this game, you immediately get 1 <GRAIN>/<CLAY>/<REED>/<STONE>/<VEGETABLE>/<FIELD> (not retroactively).',
      ],
    cost: { food: 1 },
    prerequisite: '2 Imps',
    improvementPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const D042_EducationBonus_impl = D042_EducationBonus.impl
