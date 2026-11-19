import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CWM015_DebrisDealer'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-renovation',
      cardIds: [CARD_ID],
      actions: ['renovate-house'],
      phases: ['after'],
      scope: 'any',
      handler: (context) => {
        const owner = context.ownerPlayer ?? context.player
        const renovation = createEventQuery(context.actionEvents ?? []).filter('farm.renovated')[0]
        if (!renovation) return
        if (renovation.playerId === owner.id)
          return renovation.to === 'stone'
            ? { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { clay: 2 }) }
            : undefined
        if (owner.houseType === 'wood') return
        return {
          sourceCard: CARD_ID,
          flow: {
            ...gainLeaf(CARD_ID, renovation.to === 'clay' ? { wood: 2 } : { clay: 2 }),
            targetPlayerId: owner.id,
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM015_DebrisDealer = defineOccupationCard({
  meta: {
    id: 'CWM015_DebrisDealer',
    name: "Debris Dealer",
    deck: 'CWM',
    number: 15,
    desc: ["Whenever you renovate your clay house, you get 2 clay. If you live in a clay or stone house, each other player's renovation from wood or clay gives you 2 wood or 2 clay, respectively."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM015.png',
  },
  impl: cardImpl,
})

export const CWM015_DebrisDealer_impl = CWM015_DebrisDealer.impl
