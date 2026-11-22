import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM030_Hoarder'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: () => ({
      type: 'xor',
      optional: true,
      children: ['wood', 'clay', 'reed', 'stone'].map((resource) =>
        payGainActionFlow({
          cardId: CARD_ID,
          cost: { [resource]: 1 },
          followUp: [
            {
              type: 'leaf',
              actionId: 'store-on-card',
              sourceCard: CARD_ID,
              params: { [resource]: 1 },
            },
          ],
        }),
      ),
    }),
    computeBonusScore: (_state, player) =>
      [0, 1, 2, 3, 5][
        ['wood', 'clay', 'reed', 'stone'].filter(
          (resource) => (player.cardStates[CARD_ID]?.counters?.[resource] ?? 0) > 0,
        ).length
      ]!,
  },
} satisfies CardImpl

export const CWM030_Hoarder = defineOccupationCard({
  meta: {
    id: 'CWM030_Hoarder',
    name: "Hoarder",
    deck: 'CWM',
    number: 30,
    desc: ["Each harvest, you may place at most 1 building resource on this card. At the end of the game, get 1, 2, 3, or 5 bonus <SCORE> for having at least 1, 2, 3, or 4 different building-resource types on this card."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM030.png',
  },
  presentation: { counters: ['wood', 'clay', 'reed', 'stone'] },
  impl: cardImpl,
})

export const CWM030_Hoarder_impl = CWM030_Hoarder.impl
