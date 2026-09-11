import { defineOccupationCard } from '../card-source'
import { familySize } from '../../domain/player'
import { readCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C100_Butler'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => ({
      type: 'leaf' as const,
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: 'playedRound', value: state.round },
    }),
    computeBonusScore: (_state, player) => {
      const playedRound = readCardExtraData<number>(player, CARD_ID, 'playedRound')
      return playedRound !== undefined && playedRound <= 11 && player.rooms > familySize(player) ? 4 : 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C100_Butler = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Butler",
    deck: "C",
    number: 100,
    category: "POINTS_PROVIDER",
    desc: ["If you play this card in round 11 or before, during scoring, you get 4 bonus <SCORE> if you then have more rooms than people."],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const C100_Butler_impl = C100_Butler.impl
