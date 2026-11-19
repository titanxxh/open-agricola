import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM086_GlassblowersShop'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeCostedBonus: (_state, player) => [
      { cost: {}, score: 0 },
      ...[2, 4, 5].flatMap((clay, index) =>
        player.resources.clay >= clay ? [{ cost: { clay }, score: index + 1 }] : [],
      ),
    ],
  },
} satisfies CardImpl

export const CWM086_GlassblowersShop = defineMinorCard({
  meta: {
    returnCards: ['Major_Pottery'],
    alsoCountsAs: ['major'],
    potteryIdentity: true,
    exchanges: [{ from: { clay: 1 }, to: { food: 3 }, triggers: ['harvest'], max: 1 }],

    id: 'CWM086_GlassblowersShop',
    name: "Glassblower's Shop",
    deck: 'CWM',
    number: 86,
    desc: ["Each harvest, you may convert at most 1 clay into 3 food. At the end of the game, having at least 2, 4, or 5 clay gives 1, 2, or 3 bonus points. The same clay cannot also score for Pottery. This card counts as both a major and a minor improvement, but only one improvement."],
    cost: {
      clay: 1,
      stone: 1,
    },
    vp: 3,
    prerequisite: "Return Pottery",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM086.png',
  },
  impl: cardImpl,
})

export const CWM086_GlassblowersShop_impl = CWM086_GlassblowersShop.impl
