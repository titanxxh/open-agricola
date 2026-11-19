import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { farmTokenSelection } from '../../helpers/farm-token-selection'
import { commitFarmOperation } from '../../../domain/farm-operations'

const CARD_ID = 'CWM064_Bonre'

const token = farmTokenSelection(CARD_ID, { wood: 1 })
const cardImpl = {
  prerequisiteCheck: (player) => token.candidates(player).length > 0,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => token.flow(player),
    resolveChoice: (state, player, choice) => {
      if (
        choice !== 'light' ||
        !player.farmyardSpaceStates?.some((s) => s.sourceCardId === CARD_ID)
      )
        return
      commitFarmOperation(player, {
        kind: 'space-states',
        sourceCardId: CARD_ID,
        positions: [],
        states: player.farmyardSpaceStates.filter((s) => s.sourceCardId !== CARD_ID),
      })
      writeCardExtraData(player, CARD_ID, 'litRound', state.round)
    },
  },
  listeners: [
    {
      id: CARD_ID + '-light',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) =>
        player.farmyardSpaceStates?.some((s) => s.sourceCardId === CARD_ID)
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'leaf',
                actionId: 'emit-choice',
                sourceCard: CARD_ID,
                params: { options: [{ value: 'light', labelKey: `cards.${CARD_ID}.name` }] },
              },
            }
          : undefined,
    },
    {
      id: CARD_ID + '-cook',
      cardIds: [CARD_ID],
      actions: ['compute-exchanges'],
      phases: ['computeExchanges'],
      handler: ({ state, player }) =>
        readCardExtraData(player, CARD_ID, 'litRound') === state.round
          ? {
              sourceCard: CARD_ID,
              extraExchanges: (['sheep', 'boar', 'cattle'] as const).map((animal, i) => ({
                from: { [animal]: 1 },
                to: { food: i + 1 },
                triggers: ['anytime'],
                sourceId: CARD_ID,
              })),
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CWM064_Bonre = defineMinorCard({
  meta: {
    isCookery: true,

    id: 'CWM064_Bonre',
    name: "Bonfire",
    deck: 'CWM',
    number: 64,
    desc: ["Place 1 wood from the supply on an unused farmyard space. At any time, return the wood to convert animals to food for the rest of that round: 1 per sheep, 2 per wild boar, or 3 per cattle."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM064.png',
  },
  impl: cardImpl,
})

export const CWM064_Bonre_impl = CWM064_Bonre.impl
