import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getAssignedAnimalsByType } from '../../../domain/animals'

const CARD_ID = 'CWM098_PettingZoo'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      const { sheep, boar, cattle } = getAssignedAnimalsByType({ ...player, cardStates: {} })
      return sheep > 0 && boar > 0 && cattle > 0 ? Number(sheep >= 2) + Number(boar >= 2) : 0
    },
  },
} satisfies CardImpl

export const CWM098_PettingZoo = defineMinorCard({
  meta: {
    id: 'CWM098_PettingZoo',
    name: "Petting Zoo",
    deck: 'CWM',
    number: 98,
    desc: ["At the end of the game, if you have all three animal types outside cards, get 1 bonus point for having at least 2 sheep and 1 bonus point for having at least 2 wild boar. You may receive both."],
    cost: {
      wood: 2,
    },
    vp: 1,
    prerequisite: "",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM098.png',
  },
  impl: cardImpl,
})

export const CWM098_PettingZoo_impl = CWM098_PettingZoo.impl
