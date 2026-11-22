import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { returnToSpaceThenGainFlow } from '../../helpers/pay-gain-node'
import type { ActionFlow, Resource } from '../../../contract/types'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../../helpers/event-provenance'

const CARD_ID = 'CFL054_ChansonSinger'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-sing',
      cardIds: [CARD_ID],
      actionSpaces: ['traveling-players', 'traveling-players-56'],
      phases: ['after'],
      handler: (context) => {
        const max = Math.min(4, sumActionSpaceMovedToTriggerPlayerFromSpace(context, 'food'))
        if (max === 0) return
        const goods = ['wood', 'clay', 'reed', 'stone'] as const
        const children: ActionFlow[] = Array.from({ length: max }, (_, index) => {
          const gain: Partial<Resource> = Object.fromEntries(
            goods.slice(0, index + 1).map((key) => [key, 1]),
          )
          return returnToSpaceThenGainFlow({
            cardId: CARD_ID,
            cost: { food: index + 1 },
            gain,
            choiceLabelKey: 'ui.interactionResourceExchange',
          }).flow!
        })
        return { flow: { type: 'xor', optional: true, children } }
      },
    },
  ],
} satisfies CardImpl

export const CFL054_ChansonSinger = defineOccupationCard({
  meta: {
    id: 'CFL054_ChansonSinger',
    name: 'Chanson Singer',
    deck: 'CFL',
    number: 54,
    players: '1+',
    desc: [
      'Whenever you use Traveling Players, you may leave 1/2/3/4 <FOOD> there to get 1 <WOOD>/1 <WOOD> and 1 <CLAY>/1 <WOOD>, 1 <CLAY>, and 1 <REED>/1 of each building resource.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL054.png',
  },
  impl: cardImpl,
})
