import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getLogicalFields } from '../../helpers/card-field'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM077_EdibleRoots'

const cardImpl = {
  prerequisiteCheck: (player) => getLogicalFields(player).length >= 3,
  listeners: [
    {
      id: CARD_ID + '-last-crop',
      cardIds: [CARD_ID],
      actions: ['reap'],
      phases: ['after'],
      handler: (context) => {
        const receipt =
          context.result && 'extraData' in context.result
            ? context.result.extraData
            : context.extraData
        const count = Array.isArray(receipt?.emptiedFields) ? receipt.emptiedFields.length : 0
        return count > 0
          ? { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { food: count }) }
          : undefined
      },
    },
  ],
} satisfies CardImpl

export const CWM077_EdibleRoots = defineMinorCard({
  meta: {
    id: 'CWM077_EdibleRoots',
    name: "Edible Roots",
    deck: 'CWM',
    number: 77,
    desc: ["Whenever you harvest the last good from a field into your supply, you get 1 food. Card fields count toward the prerequisite. Each card with several sown stacks counts as one field and gives at most 1 food per harvest operation."],
    cost: {},
    vp: 0,
    prerequisite: "3 fields",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM077.png',
  },
  impl: cardImpl,
})

export const CWM077_EdibleRoots_impl = CWM077_EdibleRoots.impl
