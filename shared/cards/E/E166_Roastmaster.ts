import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E166_Roastmaster'
const PAIR: Record<string, string> = {
  fishing: 'traveling-players',
  'traveling-players': 'fishing',
}

const listener: CardListenerRegistration = {
  id: 'E166-roastmaster-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const placedSpaceId = context.space?.id
    if (!placedSpaceId) return
    const otherSpaceId = PAIR[placedSpaceId]
    if (!otherSpaceId) return
    if (!context.state.actionSpaces.find((s) => s.id === otherSpaceId)) return
    // Need at least 1 food on the placed space to move
    const currentFood = context.space?.resources?.food ?? 0
    if (currentFood <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: {
              kind: 'move-resource-between-spaces',
              fromSpaceId: placedSpaceId,
              toSpaceId: otherSpaceId,
              resource: 'food',
              amount: 1,
            },
          },
          gainLeaf(CARD_ID, { cattle: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E166_Roastmaster = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Roastmaster',
    deck: 'E',
    number: 166,
    category: 'ANIMALS_-_CATTLE',
    desc: ['Each time you use the __Traveling Players__ or __Fishing__ accumulation spaces, you can move exactly 1 <FOOD> from that space to the other to get 1 <CATTLE>.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const E166_Roastmaster_impl = E166_Roastmaster.impl
