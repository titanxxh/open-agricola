import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { gainLeaf, payGainActionFlow } from '../../helpers/pay-gain-node'
import { bonusVpLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM114_WineCloset'

type Wine = { round: number; count: number }
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { vegetable: 1 }),
    onRoundStart: (state, player) => {
      const schedule = readCardExtraData<Wine[]>(player, CARD_ID, 'wine') ?? []
      const count = schedule
        .filter((w) => w.round === state.round)
        .reduce((sum, w) => sum + w.count, 0)
      writeCardExtraData(
        player,
        CARD_ID,
        'wine',
        schedule.filter((w) => w.round > state.round),
      )
      return count > 0
        ? {
            type: 'seq',
            children: Array.from({ length: count }, () => ({
              type: 'xor',
              children: [gainLeaf(CARD_ID, { food: 2 }), bonusVpLeaf(CARD_ID)],
            })),
          }
        : undefined
    },
    resolveChoice: (state, player, choice) => {
      if (!choice.startsWith('wine:')) return
      const round = Number(choice.slice(5))
      if (
        !Number.isInteger(round) ||
        round <= state.round ||
        round > 14 ||
        readCardExtraData(player, CARD_ID, 'usedRound') === state.round
      )
        return
      const wine = [
        ...(readCardExtraData<Wine[]>(player, CARD_ID, 'wine') ?? []),
        { round, count: round - state.round >= 5 ? 2 : 1 },
      ]
      return payGainActionFlow({
        cardId: CARD_ID,
        cost: { vegetable: 1 },
        followUp: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'wine', value: wine },
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'usedRound', value: state.round },
          },
        ],
      })
    },
  },
  listeners: [
    {
      id: CARD_ID + '-store',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ state, player }) => {
        if (
          state.round >= 14 ||
          player.resources.vegetable < 1 ||
          readCardExtraData(player, CARD_ID, 'usedRound') === state.round
        )
          return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'leaf',
            actionId: 'emit-choice',
            sourceCard: CARD_ID,
            params: {
              requiresExplicitChoice: true,
              options: Array.from({ length: 14 - state.round }, (_, i) => ({
                value: 'wine:' + (state.round + i + 1),
                labelKey: 'ui.round',
                labelParams: { round: state.round + i + 1 },
              })),
            },
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM114_WineCloset = defineMinorCard({
  meta: {
    id: 'CWM114_WineCloset',
    name: "Wine Closet",
    deck: 'CWM',
    number: 114,
    desc: ["Immediately get 1 vegetable. Once per round, you may place 1 vegetable on a future round space. If it is at least 5 rounds ahead, add a second vegetable from the supply. At the start of that round, each vegetable there must become either 2 food or 1 bonus point."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM114.png',
  },
  impl: cardImpl,
})

export const CWM114_WineCloset_impl = CWM114_WineCloset.impl
