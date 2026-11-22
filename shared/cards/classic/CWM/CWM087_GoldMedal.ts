import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'

const CARD_ID = 'CWM087_GoldMedal'

const categories = [
  'grains',
  'vegetables',
  'sheeps',
  'boars',
  'cattles',
  'fields',
  'pastures',
  'stables',
] as const
const cardImpl = {
  prerequisiteCheck: (_player, state) => !!state && state.round <= 7,
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'emit-choice',
      sourceCard: CARD_ID,
      params: {
        requiresExplicitChoice: true,
        options: categories.map((value) => ({
          value,
          labelKey: `ui.scoring${value[0]!.toUpperCase()}${value.slice(1)}`,
        })),
      },
    }),
    resolveChoice: (_state, player, choice) => {
      if ((categories as readonly string[]).includes(choice))
        writeCardExtraData(player, CARD_ID, 'category', choice)
    },
    computeSharedPostScore: (_state, owner, summaries) => {
      const category = readCardExtraData<string>(owner, CARD_ID, 'category')
      if (!category) return []
      const counts = summaries.map((s) => ({
        playerId: s.playerId,
        value:
          s.categories
            .find((c) => c.key === category)
            ?.entries.filter((e) => e.type === 'quantity')
            .reduce((sum, e) => sum + e.score, 0) ?? -1,
      }))
      const maximum = Math.max(...counts.map((s) => s.value))
      return counts
        .filter((s) => s.value === maximum)
        .map((s) => ({ playerId: s.playerId, score: 2 }))
    },
  },
} satisfies CardImpl

export const CWM087_GoldMedal = defineMinorCard({
  meta: {
    id: 'CWM087_GoldMedal',
    name: "Gold Medal",
    deck: 'CWM',
    number: 87,
    desc: ["Choose <GRAIN>, <VEGETABLE>, <SHEEP>, <BOAR>, <CATTLE>, <FIELD>, pastures, or fenced <STABLE> when you play this card. At the end of the game, every player tied for the highest normal score in that category gets 2 bonus <SCORE>. Ignore other cards' bonus <SCORE>."],
    cost: {},
    vp: 0,
    prerequisite: "Round 7 or earlier",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM087.png',
  },
  impl: cardImpl,
})

export const CWM087_GoldMedal_impl = CWM087_GoldMedal.impl
