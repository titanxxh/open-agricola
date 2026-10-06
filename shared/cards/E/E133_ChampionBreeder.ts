import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E133_ChampionBreeder'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (state, player) => {
    const summary = state.harvestBreedSummary?.[player.id]
    if (!summary) return
    const { animalCount } = summary
    if (animalCount >= 3) {
      return {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
        ],
      }
    }
    if (animalCount >= 2) {
      return { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID }
    }
    return undefined
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E133_ChampionBreeder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Champion Breeder",
    deck: "E",
    number: 133,
    desc: ["Each time you place 2 or 3+ newborn animals on your farm during the breeding phase of the harvest, you get 1 or 2 bonus <SCORE>, respectively."],
    cost: {},
    players: "3+",
    extraVp: true,
    category: 'BONUS_POINTS',
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const E133_ChampionBreeder_impl = E133_ChampionBreeder.impl
