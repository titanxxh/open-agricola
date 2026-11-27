import type { ActionFlow } from '../../../contract/types'
import { defineMinorCard } from '../../card-source'
import { isCardFlagged } from '../../helpers/card-state'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM109_SteelPlow'

const optionalPlowChain = (remaining: number): ActionFlow =>
  remaining <= 1
    ? { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID, optional: true }
    : {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
          optionalPlowChain(remaining - 1),
        ],
      }

const cardImpl = {
  listeners: [
    {
      id: `${CARD_ID}-replace-plow`,
      cardIds: [CARD_ID],
      actions: ['plow'],
      phases: ['computeReplace'],
      handler: (context) => {
        if (context.sourceCard) return
        if (context.space?.id !== 'farmland' && context.space?.id !== 'cultivation') return
        if (isCardFlagged(context.player, CARD_ID)) return
        return {
          decline: true,
          sourceCard: CARD_ID,
          alternativeFlow: {
            type: 'seq',
            choiceLabelKey: `cards.${CARD_ID}.name`,
            children: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-flag', flag: true },
              },
              { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
              optionalPlowChain(3),
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM109_SteelPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Steel Plow',
    deck: 'CWM',
    number: 109,
    cost: { wood: 3, stone: 1 },
    vp: 0,
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
    desc: [
      'Once during the game, when you use either the __space:farmland|Farmland__ or __space:cultivation|Cultivation__ action space, you can plow up to 4 <FIELD> instead of 1.',
    ],
    artUrl: 'assets/classic/CWM/CWM109.png',
    implemented: true,
  },
  impl: cardImpl,
})

export const CWM109_SteelPlow_impl = CWM109_SteelPlow.impl
