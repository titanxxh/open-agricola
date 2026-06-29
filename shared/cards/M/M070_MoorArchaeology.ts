import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import {
  farmyardSpaceBonus,
  makeClearedSpaceTokenListener,
} from './moor-farmyard-space-token'

const CARD_ID = 'M070_MoorArchaeology'

const cardImpl = {
  listeners: [
    makeClearedSpaceTokenListener({
      cardId: CARD_ID,
      listenerId: 'M070-moor-archaeology-after-cut-peat',
      actions: ['cut-peat'],
      kind: 'blocked-farmyard-space',
      bonusVp: 1,
      blocksPlacement: true,
      optional: true,
      consumeFence: true,
    }),
  ],
  effect: {
    id: CARD_ID,
    computeBonusScore: farmyardSpaceBonus(CARD_ID),
  },
  prerequisiteCheck: (player) => player.houseType === 'clay',
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M070_MoorArchaeology = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Moor Archaeology",
    deck: "M",
    number: 70,
    category: "POINTS_PROVIDER",
    desc: [
        "Each time you take the \"Cut Peat\" special action, you can place 1 fence from your supply on the emptied farmyard space. That space counts as used but it is blocked for the rest of the game. During scoring, it is worth 1 additional bonus point."
    ],
    cost: {},
    vp: 1,
    extraVp: true,
    prerequisite: "Clay House",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})
