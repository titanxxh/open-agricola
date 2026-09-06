import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import { isSpaceOccupied } from '../../domain/space'
import { getAssignedAnimalsByType } from '../../domain/animals'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/helpers/placement-constants'
import type { CardImpl } from '../registry'

const CARD_ID = 'E021_SheepRug'
const WISH_SPACE_IDS = ['wish-children', 'urgent-wish-children']

const countNonNewbornPeople = (
  state: CardListenerContext['state'],
  space: CardListenerContext['space'],
): number =>
  space.takenBy.filter((workerRef) => {
    const worker = state.players
      .find((candidate) => candidate.id === workerRef.playerId)
      ?.workers.find((candidate) => candidate.id === workerRef.workerId)
    return worker?.isNewborn !== true
  }).length

const computeArgsListener: CardListenerRegistration = {
  id: 'E21-sheep-rug-compute-args-place-farmer',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const extraOptions: ActionChoiceOption[] = []
    for (const spaceId of WISH_SPACE_IDS) {
      const space = context.state.actionSpaces.find((s) => s.id === spaceId)
      if (!space) continue
      if (!isSpaceOccupied(space)) continue
      if (countNonNewbornPeople(context.state, space) > 1) continue
      if (!space.canBeExecutedByPlayer(context.state, context.player)) continue
      extraOptions.push({
        value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${spaceId}`,
        labelKey: space.nameKey,
      })
    }
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  prerequisiteCheck: (player, state) => getAssignedAnimalsByType(player, state).sheep >= 4,
  listeners: [computeArgsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E021_SheepRug = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Sheep Rug',
    deck: 'E',
    number: 21,
    category: 'ACTION_-_FAMILY_GROWTH',
    desc: ["You can use any __Wish for Children__ action space, even if it is occupied by another player's person."],
    vp: 1,
    cost: { sheep: 1 },
    prerequisite: '4 Sheep',
  },
  impl: cardImpl,
})

export const E021_SheepRug_impl = E021_SheepRug.impl
