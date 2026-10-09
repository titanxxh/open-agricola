import { defineMinorCard } from '../card-source'
import { animalKeysForState, type AnimalKey } from '../../contract/animals'
import type { CardImpl } from '../registry'
import { chooseScheduledOfferPlans } from '../../actions/effects/internal/schedule-offers'
import {
  scheduledOffersRoundStartFlow,
  type ScheduledOffer,
} from '../../actions/effects/internal/scheduled-offers'

const CARD_ID = 'M131_CattleStall'

const OFFSETS = [2, 4, 6, 8] as const

const permutations = <T,>(items: readonly T[]): T[][] => {
  if (items.length <= 1) return [items.slice()]
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)])
      .map((rest) => [item, ...rest]),
  )
}

const scheduleAnimals = (
  baseRound: number,
  animals: readonly AnimalKey[],
): ScheduledOffer[] =>
  animals
    .map((animal, index): ScheduledOffer => ({
      id: `${CARD_ID}-${baseRound + OFFSETS[index]!}`,
      kind: 'animal-purchase',
      dueRound: baseRound + OFFSETS[index]!,
      animal,
      cost: { food: 1 },
      consumed: false,
    }))
    .filter((offer) => offer.dueRound <= 14)

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const animals = animalKeysForState(state)
      if (animals.length < 4) return
      return chooseScheduledOfferPlans(state, CARD_ID, permutations(animals).map((order) => scheduleAnimals(state.round, order)))
    },
    onRoundStart: (state, player) => scheduledOffersRoundStartFlow(state, player, CARD_ID),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M131_CattleStall = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Cattle Stall",
    deck: "M",
    number: 131,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "Add 2, 4, 6, and 8 to the current round and place 1 animal of your choice on each corresponding round space. All the animals must be different. At the start of these rounds, you can buy the respective animal for 1 <FOOD>."
    ],
    cost: {
        "wood": 2,
        "clay": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M131_CattleStall_impl = M131_CattleStall.impl
