import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf, payGainActionFlow } from '../../helpers/pay-gain-node'
import { readCardExtraData } from '../../helpers/card-state'

const CARD_ID = 'CWM041_Politician'

const cardImpl = {
  effect: { id: CARD_ID, onBuy: () => gainLeaf(CARD_ID, { stone: 1 }) },
  listeners: [
    {
      id: CARD_ID + '-trade',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ state, player }) => {
        const uses =
          readCardExtraData(player, CARD_ID, 'usedRound') === state.round
            ? (player.cardStates[CARD_ID]?.counters?.uses ?? 0)
            : 0
        if (uses >= 2) return
        const from = (['reed', 'stone'] as const).filter(
          (resource) => player.resources[resource] > 0,
        )
        if (!from.length) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            children: from.map((resource) =>
              payGainActionFlow({
                cardId: CARD_ID,
                cost: { [resource]: 1 },
                gain: { [resource === 'reed' ? 'stone' : 'reed']: 1 },
                followUp: [
                  {
                    type: 'leaf',
                    actionId: 'special-effect',
                    sourceCard: CARD_ID,
                    params: { kind: 'set-extra-data', key: 'usedRound', value: state.round },
                  },
                  {
                    type: 'leaf',
                    actionId: 'special-effect',
                    sourceCard: CARD_ID,
                    params: { kind: 'set-counter', key: 'uses', value: uses + 1 },
                  },
                ],
              }),
            ),
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM041_Politician = defineOccupationCard({
  meta: {
    id: 'CWM041_Politician',
    name: "Politician",
    deck: 'CWM',
    number: 41,
    desc: ["Immediately get 1 <STONE>. Up to twice per round, at any time, you may exchange 1 <REED> for 1 <STONE> or 1 <STONE> for 1 <REED>."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM041.png',
  },
  impl: cardImpl,
})

export const CWM041_Politician_impl = CWM041_Politician.impl
