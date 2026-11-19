import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { classicPlow } from '../../helpers/classic-plow'
import { readCardExtraData } from '../../helpers/card-state'

const CARD_ID = 'CWM091_IronPlow'

const plow = classicPlow(CARD_ID, 1, 1, ['farmland'])
const cardImpl = {
  ...plow,
  listeners: [
    ...plow.listeners!,
    {
      id: CARD_ID + '-sow',
      cardIds: [CARD_ID],
      actionSpaces: ['farmland'],
      phases: ['after'],
      handler: (context) =>
        context.actionSpaceUse?.useId &&
        readCardExtraData(context.player, CARD_ID, 'plowUse') === context.actionSpaceUse.useId
          ? {
              sourceCard: CARD_ID,
              flow: { type: 'leaf', actionId: 'sow', sourceCard: CARD_ID, optional: true },
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CWM091_IronPlow = defineMinorCard({
  meta: {
    id: 'CWM091_IronPlow',
    name: "Iron Plow",
    deck: 'CWM',
    number: 91,
    desc: ["Place 1 field tile on this card. Once only, when you use Farmland, you may spend the tile to plow up to 2 fields instead of 1, then take a Sow action. Only one plow or Harrow effect may be used per Farmland or Cultivation visit."],
    cost: {
      wood: 1,
      stone: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM091.png',
  },
  presentation: { stack: true },
  impl: cardImpl,
})

export const CWM091_IronPlow_impl = CWM091_IronPlow.impl
