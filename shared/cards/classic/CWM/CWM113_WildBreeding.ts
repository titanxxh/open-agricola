import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { canAccommodateAllAnimals } from '../../../domain/animal-zones'
import type { ActionFlow } from '../../../contract/types'

const CARD_ID = 'CWM113_WildBreeding'
const ANIMALS = ['sheep', 'boar', 'cattle'] as const

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const bred = state.actionSpaces.flatMap((space) => ANIMALS
        .filter((animal) => (space.gainPerRound[animal] ?? 0) > 0 && (space.resources[animal] ?? 0) >= 2)
        .map((animal) => ({ spaceId: space.id, animal })))
      if (!bred.length) return
      const add = bred.map(({ spaceId, animal }): ActionFlow => ({
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'add-resource-to-space', spaceId, resource: animal, amount: 1 },
      }))
      const take = bred
        .filter(({ animal }) => canAccommodateAllAnimals(state, player, [animal]))
        .map(({ spaceId, animal }): ActionFlow => ({
          type: 'leaf',
          actionId: 'collect',
          sourceCard: CARD_ID,
          actionContext: { spaceId, resource: animal, amount: 1 },
        }))
      return {
        type: 'seq',
        children: take.length ? [...add, { type: 'xor', optional: true, sourceCard: CARD_ID, children: take }] : add,
      }
    },
  },
} satisfies CardImpl

export const CWM113_WildBreeding = defineMinorCard({
  meta: {
    id: 'CWM113_WildBreeding',
    name: "Wild Breeding",
    deck: 'CWM',
    number: 113,
    desc: ["Add 1 animal to each animal accumulation space containing at least 2 animals. If you have housing capacity, you may take at most one of the newly added animals. Afterwards, pass this card to the next player, who adds it to their hand."],
    cost: {
      reed: 1,
    },
    vp: 1,
    prerequisite: "",
    passing: true,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM113.png',
  },
  impl: cardImpl,
})

export const CWM113_WildBreeding_impl = CWM113_WildBreeding.impl
