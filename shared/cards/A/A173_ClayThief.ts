import { defineOccupationCard } from '../card-source'
import { readCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A173_ClayThief'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onRoundStart: (state, player) => {
      if (readCardExtraData<boolean>(player, CARD_ID, 'used')) return
      const hollow = state.actionSpaces.find((space) => space.id === 'hollow-56')
      const clay = hollow?.resources.clay ?? 0
      if (clay <= 0) return
      return {
        type: 'seq' as const,
        optional: true,
        children: [
          {
            type: 'leaf' as const,
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'used', value: true },
          },
          {
            type: 'leaf' as const,
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-infobox', text: 'Used' },
          },
          {
            type: 'leaf' as const,
            actionId: 'collect',
            sourceCard: CARD_ID,
            actionContext: { spaceId: 'hollow-56', resource: 'clay', amount: clay },
          },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A173_ClayThief = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Clay Thief',
    deck: 'A',
    number: 173,
    category: 'FOOD_PROVIDER',
    desc: ['Once this game, at the start of a work phase of your choice, you can turn this card face down to get all of the <CLAY> on the "Hollow" action space.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A173_ClayThief_impl = A173_ClayThief.impl
