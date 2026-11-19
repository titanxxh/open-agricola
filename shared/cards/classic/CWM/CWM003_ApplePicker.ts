import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM003_ApplePicker'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-space',
      cardIds: [CARD_ID],
      actionSpaces: ['grain-seeds', 'vegetable-seeds'],
      phases: ['after'],
      handler: () => ({ sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { wood: 1, food: 1 }) }),
    },
  ],
} satisfies CardImpl

export const CWM003_ApplePicker = defineOccupationCard({
  meta: {
    id: 'CWM003_ApplePicker',
    name: "Apple Picker",
    deck: 'CWM',
    number: 3,
    desc: ["Whenever you use Grain Seeds or Vegetable Seeds, you also get 1 wood and 1 food."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM003.png',
  },
  impl: cardImpl,
})

export const CWM003_ApplePicker_impl = CWM003_ApplePicker.impl
