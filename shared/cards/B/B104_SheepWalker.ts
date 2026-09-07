import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { getPlacedAnimalsByType } from '../../domain/animal-zones'

const CARD_ID = 'B104_SheepWalker'

const EXCHANGES = [
  { destination: 'boar', to: { boar: 1 }, reorganize: true },
  { destination: 'vegetable', to: { vegetable: 1 } },
  { destination: 'stone', to: { stone: 1 } },
] as const

const listeners: CardListenerRegistration[] = EXCHANGES.map(({ destination, to, ...option }) => ({
  id: `B104-sheep-walker-${destination}`,
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  preScoring: true,
  blockedAnytimeInteractionKinds: ['animal-reorg'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.resources.sheep < 1 || getPlacedAnimalsByType(context.player, context.state).sheep < 1) return
    const exchange = {
      type: 'leaf' as const,
      actionId: 'exchange',
      sourceCard: CARD_ID,
      actionContext: { directTrade: { from: { sheep: 1 }, to, fromFarmyard: true, sourceId: CARD_ID } },
    }
    return {
      flow: 'reorganize' in option
        ? {
            type: 'seq',
            children: [
              exchange,
              { type: 'leaf', actionId: 'reorganize', sourceCard: CARD_ID },
            ],
          }
        : exchange,
      sourceCard: CARD_ID,
      labelKey: `cards.${CARD_ID}.${destination}`,
    }
  },
}))

const cardImpl = {
  listeners,
} satisfies CardImpl

export const B104_SheepWalker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sheep Walker',
    deck: 'B',
    number: 104,
    category: 'GOODS_PROVIDER',
    desc: [
        'At any time, you can exchange 1 <SHEEP> on your farmyard for either 1 <PIG>, 1 <VEGETABLE>, or 1 <STONE>.',
      ],
    cost: {},
    players: '1+',
    exchanges: [
        { from: { sheep: 1 }, to: { boar: 1 }, fromFarmyard: true, triggers: ['harvest'] },
        { from: { sheep: 1 }, to: { vegetable: 1 }, fromFarmyard: true, triggers: ['harvest'] },
        { from: { sheep: 1 }, to: { stone: 1 }, fromFarmyard: true, triggers: ['harvest'] },
      ],
  },
  impl: cardImpl,
})

export const B104_SheepWalker_impl = B104_SheepWalker.impl
