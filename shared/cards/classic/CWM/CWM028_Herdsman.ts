import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM028_Herdsman'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-day-labor',
      cardIds: [CARD_ID],
      actionSpaces: ['day-laborer'],
      phases: ['after'],
      handler: (context) => ({
        sourceCard: CARD_ID,
        flow:
          context.state.round < 6
            ? gainLeaf(CARD_ID, { sheep: 1 })
            : {
                type: 'xor',
                children: [gainLeaf(CARD_ID, { sheep: 1 }), gainLeaf(CARD_ID, { boar: 1 })],
              },
      }),
    },
  ],
} satisfies CardImpl

export const CWM028_Herdsman = defineOccupationCard({
  meta: {
    id: 'CWM028_Herdsman',
    name: "Herdsman",
    deck: 'CWM',
    number: 28,
    desc: ["Whenever you use __Day Laborer__, you also get 1 <SHEEP>. From round 6 onwards, you may take 1 <BOAR> instead."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM028.png',
  },
  impl: cardImpl,
})

export const CWM028_Herdsman_impl = CWM028_Herdsman.impl
