import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM070_ClockworkMan'

const cardImpl = {} satisfies CardImpl

export const CWM070_ClockworkMan = defineMinorCard({
  meta: {
    providesOccupation: true,
    alsoCountsAs: ['occupation'],

    id: CARD_ID,
    name: "Clockwork Man",
    deck: 'CWM',
    number: 70,
    desc: ["This counts as both one occupation and one minor improvement for prerequisites, effects, counts, and scoring, but is only one card. It does not increase later occupation costs or trigger effects for playing an occupation card, such as Bookshelf or Lamp Oil."],
    cost: {},
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM070.png',
  },
  impl: cardImpl,
})

export const CWM070_ClockworkMan_impl = CWM070_ClockworkMan.impl
