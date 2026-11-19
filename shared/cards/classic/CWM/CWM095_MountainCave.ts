import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM095_MountainCave'

const cardImpl = {} satisfies CardImpl

export const CWM095_MountainCave = defineMinorCard({
  meta: {
    exchanges: [{ from: { wood: 1 }, to: { stone: 1 }, triggers: ['harvest'], max: 1 }],

    id: CARD_ID,
    name: "Mountain Cave",
    deck: 'CWM',
    number: 95,
    desc: ["Each harvest, you may convert at most 1 wood into 1 stone."],
    cost: {
      food: 1,
    },
    vp: 1,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM095.png',
  },
  impl: cardImpl,
})

export const CWM095_MountainCave_impl = CWM095_MountainCave.impl
