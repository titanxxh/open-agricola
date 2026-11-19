import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CFL031_OldMaster'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onWorkStart: (state) => {
      if (state.round < 3 || state.round > 7) return
      return gainLeaf(
        CARD_ID,
        (state.actionSpaces.find((space) => space.id === 'forest')?.resources.wood ?? 0) >= 6
          ? { stone: 1 }
          : { wood: 1 },
      )
    },
  },
} satisfies CardImpl

export const CFL031_OldMaster = defineOccupationCard({
  meta: {
    id: 'CFL031_OldMaster',
    name: 'Old Master',
    deck: 'CFL',
    number: 31,
    players: '1+',
    desc: [
      'At the start of the work phases of rounds 3–7, you get 1 <WOOD>. If at least 6 <WOOD> are on the Forest accumulation space, you get 1 <STONE> instead.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL031.png',
  },
  impl: cardImpl,
})
