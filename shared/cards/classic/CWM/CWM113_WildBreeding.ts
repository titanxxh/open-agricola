import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { canAccommodateAllAnimals } from '../../../domain/animal-zones'
import type { ActionFlow } from '../../../contract/types'

const CARD_ID = 'CWM113_WildBreeding'

const ADD = 'card_' + CARD_ID + '_breed'
registerAdHocAction({
  id: ADD,
  nameKey: 'actions.breed.name',
  descriptionKey: 'actions.breed.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, eventSink }) => {
    const choices: ActionFlow[] = []
    for (const space of state.actionSpaces)
      for (const animal of ['sheep', 'boar', 'cattle'] as const) {
        if ((space.gainPerRound[animal] ?? 0) <= 0 || (space.resources[animal] ?? 0) < 2) continue
        space.resources[animal] += 1
        eventSink?.emit<'resource.accumulated'>({
          type: 'resource.accumulated',
          resources: { [animal]: 1 },
          to: { kind: 'actionSpace', spaceId: space.id },
          sourceCardId: CARD_ID,
        })
        if (canAccommodateAllAnimals(state, player, [animal]))
          choices.push({
            type: 'leaf',
            actionId: 'collect',
            sourceCard: CARD_ID,
            actionContext: { spaceId: space.id, resource: animal, amount: 1 },
          })
      }
    return choices.length
      ? { type: 'flow', flow: { type: 'xor', optional: true, children: choices } }
      : { type: 'ok' }
  },
})
const cardImpl = {
  effect: { id: CARD_ID, onBuy: () => ({ type: 'leaf', actionId: ADD, sourceCard: CARD_ID }) },
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
