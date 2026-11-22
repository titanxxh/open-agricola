import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../../actions/helpers/placement-constants'

const CARD_ID = 'CWM092_Keys'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-occupied-expansion',
      cardIds: [CARD_ID],
      actions: ['place-farmer'],
      phases: ['computeArgs'],
      handler: ({ state, player }) => {
        const space = state.actionSpaces.find((s) => s.id === 'farm-expansion')
        if (!space?.takenBy.length || space.takenBy.some((worker) => worker.playerId === player.id))
          return
        return {
          sourceCard: CARD_ID,
          extraOptions: [
            {
              value: OCCUPIED_SPACE_CHOICE_PREFIX + space.id,
              labelKey: space.nameKey,
              sourceCard: CARD_ID,
            },
          ],
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM092_Keys = defineMinorCard({
  meta: {
    id: 'CWM092_Keys',
    name: "Keys",
    deck: 'CWM',
    number: 92,
    desc: ["You may use __Farm Expansion__ when occupied by another player, but not when occupied by yourself. This does not apply to the 5-player Build 1 Room action space."],
    cost: {
      stone: 1,
    },
    vp: 1,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM092.png',
  },
  impl: cardImpl,
})

export const CWM092_Keys_impl = CWM092_Keys.impl
