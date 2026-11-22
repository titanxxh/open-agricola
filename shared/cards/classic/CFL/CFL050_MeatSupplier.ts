import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL050_MeatSupplier'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (state, player) => ({
      type: 'xor',
      optional: true,
      children: (['boar', 'cattle'] as const).map((animal) =>
        payGainActionFlow({
          cardId: CARD_ID,
          cost: { [animal]: 1 },
          gain: { score: 1 },
          choiceLabelKey: 'ui.interactionResourceExchange',
          followUp: state.players
            .filter((other) => other.id !== player.id)
            .map((other) => ({
              type: 'leaf',
              actionId: 'gain',
              sourceCard: CARD_ID,
              params: { food: 1, recipientPlayerId: other.id },
            })),
        }),
      ),
    }),
  },
} satisfies CardImpl

export const CFL050_MeatSupplier = defineOccupationCard({
  meta: {
    id: 'CFL050_MeatSupplier',
    name: 'Meat Supplier',
    deck: 'CFL',
    number: 50,
    players: '1+',
    extraVp: true,
    desc: [
      'At the start of each harvest, you may pay 1 <PIG> or 1 <CATTLE> to get 1 bonus <SCORE>. If you do, each other player gets 1 <FOOD>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL050.png',
  },
  impl: cardImpl,
})
