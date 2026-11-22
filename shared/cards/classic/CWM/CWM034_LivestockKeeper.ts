import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData } from '../../helpers/card-state'
import { gainLeaf, payGainActionFlow } from '../../helpers/pay-gain-node'
import { getBreedThreshold } from '../../card-effects'

const CARD_ID = 'CWM034_LivestockKeeper'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) =>
      gainLeaf(CARD_ID, player.resources.boar > 0 ? { cattle: 1 } : { boar: 1 }),
    computeBreedOffspringCount: (state, player, animal, current, context) =>
      context.sourceCard === 'harvest' &&
      readCardExtraData(player, CARD_ID, 'usedRound') === state.round &&
      readCardExtraData(player, CARD_ID, 'animal') === animal
        ? current + 1
        : undefined,
  },
  listeners: [
    {
      id: CARD_ID + '-offspring',
      cardIds: [CARD_ID],
      actions: ['breed'],
      phases: ['before'],
      handler: ({ state, player, actionContext }) => {
        if (
          actionContext?.sourceCard !== 'harvest' ||
          readCardExtraData(player, CARD_ID, 'usedRound') === state.round
        )
          return
        const eligible = (['sheep', 'boar', 'cattle'] as const).filter(
          (animal) =>
            player.resources[animal] >=
            getBreedThreshold(state, player, animal, { sourceCard: 'harvest' }),
        )
        if (!eligible.length) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            optional: true,
            children: eligible.map((animal) =>
              payGainActionFlow({
                cardId: CARD_ID,
                cost: { food: 1 },
                followUp: [
                  {
                    type: 'leaf',
                    actionId: 'special-effect',
                    sourceCard: CARD_ID,
                    params: { kind: 'set-extra-data', key: 'animal', value: animal },
                  },
                  {
                    type: 'leaf',
                    actionId: 'special-effect',
                    sourceCard: CARD_ID,
                    params: { kind: 'set-extra-data', key: 'usedRound', value: state.round },
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

export const CWM034_LivestockKeeper = defineOccupationCard({
  meta: {
    id: 'CWM034_LivestockKeeper',
    name: "Livestock Keeper",
    deck: 'CWM',
    number: 34,
    desc: ["Immediately get 1 wild boar, or 1 cattle if you already have a wild boar. During each harvest breeding phase, you may pay 1 food for one animal type to breed an additional offspring."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM034.png',
  },
  impl: cardImpl,
})

export const CWM034_LivestockKeeper_impl = CWM034_LivestockKeeper.impl
