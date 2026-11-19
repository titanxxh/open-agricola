import { defineMinorCard } from '../../card-source'
import { grantImmediateGuestLeaf } from '../../helpers/guest-flow'

const CARD_ID = 'CWA014_CatTongue'

export const CWA014_CatTongue = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Cat Tongue',
    deck: 'CWA',
    number: 14,
    desc: ['Each time you take a __Family Growth__ action, you receive 1 guest. In the work phase, you can immediately place the guest on the __space:fishing|Fishing__ accumulation space.'],
    cost: { food: 1 },
  },
  impl: {
    listeners: [{
      id: 'CWA014-cat-tongue-after-family-growth',
      cardIds: [CARD_ID],
      actions: ['family-growth'],
      phases: ['immediatelyAfter'],
      handler: ({ state }) => {
        return {
          sourceCard: CARD_ID,
          flow: grantImmediateGuestLeaf(CARD_ID, {
            where: { kind: 'spaces', spaceIds: state.roundPhase === 'work' ? ['fishing'] : [] },
            optional: true,
          }),
        }
      },
    }],
  },
})
