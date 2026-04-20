import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D42_EducationBonus'

// D42 Education Bonus: After you play your 1st/2nd/3rd/4th/5th occupation this game,
// you immediately get 1 GRAIN/CLAY/REED/STONE/VEGETABLE (not retroactively).
// 6th occupation: optional plow 1 field.
const GAINS = [null, 'grain', 'clay', 'reed', 'stone', 'vegetable'] as const

const listener: CardListenerRegistration = {
  id: 'D42-education-bonus-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
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

export const D42_EducationBonus = new MinorImprovement({
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
})

export const D42_EducationBonus_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
